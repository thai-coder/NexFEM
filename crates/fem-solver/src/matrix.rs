//! Two SPD stiffness backends: skyline direct Cholesky for small models and
//! sparse diagonally-preconditioned CG when the skyline profile is too large.
//! PCG is an explicit, convergence-checked fallback; no false "success" result.
use crate::skyline::{Singular, Skyline};
use std::collections::BTreeMap;

/// The skyline profile budget is measured in doubles (2M ~= 16 MiB).
pub const MAX_SKYLINE_PROFILE: usize = 2_000_000;

pub enum Matrix {
    Skyline(Skyline),
    Sparse(SparseCg),
}

#[derive(Debug)]
pub enum SolveError {
    NonConverged,
    Indefinite,
}

impl Matrix {
    pub fn new(first: Vec<usize>) -> Self {
        // WASM32 uses 32-bit usize: a 100k-DOF skyline can exceed u32::MAX.
        // Saturation preserves safe fallback selection instead of overflow.
        let estimated = first.iter().enumerate().fold(0usize, |acc, (j, f)| {
            acc.saturating_add(j.saturating_sub(*f).saturating_add(1))
        });
        if estimated > MAX_SKYLINE_PROFILE {
            Self::Sparse(SparseCg::new(first.len()))
        } else {
            Self::Skyline(Skyline::new(first))
        }
    }

    pub fn backend(&self) -> &'static str {
        match self {
            Self::Skyline(_) => "skyline_cholesky",
            Self::Sparse(_) => "sparse_pcg_jacobi",
        }
    }

    pub fn profile(&self) -> usize {
        match self {
            Self::Skyline(k) => k.profile(),
            Self::Sparse(k) => k.profile(),
        }
    }

    pub fn add(&mut self, i: usize, j: usize, v: f64) {
        match self {
            Self::Skyline(k) => k.add(i, j, v),
            Self::Sparse(k) => k.add(i, j, v),
        }
    }

    pub fn get(&self, i: usize, j: usize) -> f64 {
        match self {
            Self::Skyline(k) => k.get(i, j),
            Self::Sparse(k) => k.get(i, j),
        }
    }

    pub fn factor(&mut self, rel_tol: f64) -> Result<(), Singular> {
        match self {
            Self::Skyline(k) => k.factor(rel_tol),
            Self::Sparse(k) => k.factor(),
        }
    }

    pub fn solve(&self, rhs: &mut [f64]) -> Result<(), SolveError> {
        match self {
            Self::Skyline(k) => {
                k.solve(rhs);
                Ok(())
            }
            Self::Sparse(k) => k.solve(rhs),
        }
    }
}

/// Upper-triangular assembly is compressed to full CSR only once per analysis.
pub struct SparseCg {
    rows: Vec<BTreeMap<usize, f64>>,
    diag: Vec<f64>,
    row_ptr: Vec<usize>,
    cols: Vec<usize>,
    values: Vec<f64>,
    nonzeros: usize,
}

impl SparseCg {
    pub fn new(n: usize) -> Self {
        Self {
            rows: vec![BTreeMap::new(); n],
            diag: Vec::new(),
            row_ptr: Vec::new(),
            cols: Vec::new(),
            values: Vec::new(),
            nonzeros: 0,
        }
    }

    pub fn profile(&self) -> usize {
        if self.row_ptr.is_empty() {
            self.rows.iter().map(BTreeMap::len).sum()
        } else {
            self.nonzeros
        }
    }

    pub fn add(&mut self, i: usize, j: usize, v: f64) {
        let (a, b) = if i <= j { (i, j) } else { (j, i) };
        *self.rows[a].entry(b).or_insert(0.0) += v;
    }

    pub fn get(&self, i: usize, j: usize) -> f64 {
        let (a, b) = if i <= j { (i, j) } else { (j, i) };
        self.rows[a].get(&b).copied().unwrap_or(0.0)
    }

    pub fn factor(&mut self) -> Result<(), Singular> {
        let n = self.rows.len();
        self.diag = (0..n).map(|i| self.get(i, i)).collect();
        for (i, d) in self.diag.iter().enumerate() {
            if !d.is_finite() || *d <= 0.0 {
                return Err(Singular { dof: i });
            }
        }
        let mut full = vec![Vec::<(usize, f64)>::new(); n];
        for (i, row) in self.rows.iter().enumerate() {
            for (&j, &v) in row {
                if v == 0.0 {
                    continue;
                }
                if !v.is_finite() {
                    return Err(Singular { dof: i });
                }
                full[i].push((j, v));
                if i != j {
                    full[j].push((i, v));
                }
            }
        }
        self.row_ptr = Vec::with_capacity(n + 1);
        self.row_ptr.push(0);
        self.cols.clear();
        self.values.clear();
        for row in &mut full {
            row.sort_unstable_by_key(|entry| entry.0);
            for &(j, v) in row.iter() {
                self.cols.push(j);
                self.values.push(v);
            }
            self.row_ptr.push(self.cols.len());
        }
        self.nonzeros = self.values.len();
        Ok(())
    }

    fn mul(&self, x: &[f64], y: &mut [f64]) {
        for (i, yi) in y.iter_mut().enumerate() {
            let begin = self.row_ptr[i];
            let end = self.row_ptr[i + 1];
            *yi = (begin..end).map(|p| self.values[p] * x[self.cols[p]]).sum();
        }
    }

    /// Diagonal-preconditioned CG with an energy-weighted residual and strict
    /// iteration cap. Non-convergence is surfaced as an error, never as output.
    pub fn solve(&self, rhs: &mut [f64]) -> Result<(), SolveError> {
        let n = rhs.len();
        if n == 0 {
            return Ok(());
        }
        let mut x = vec![0.0; n];
        let mut r = rhs.to_vec();
        let mut z: Vec<f64> = r.iter().zip(&self.diag).map(|(&ri, &d)| ri / d).collect();
        let mut p = z.clone();
        let mut rz: f64 = r.iter().zip(&z).map(|(a, b)| a * b).sum();
        if !rz.is_finite() || rz < 0.0 {
            return Err(SolveError::Indefinite);
        }
        if rz == 0.0 {
            rhs.fill(0.0);
            return Ok(());
        }
        let initial = rz.sqrt();
        let max_iter = (n.saturating_mul(3)).clamp(500, 5000);
        let mut ap = vec![0.0; n];
        for _ in 0..max_iter {
            self.mul(&p, &mut ap);
            let pap: f64 = p.iter().zip(&ap).map(|(a, b)| a * b).sum();
            if !pap.is_finite() || pap <= 0.0 {
                return Err(SolveError::Indefinite);
            }
            let alpha = rz / pap;
            for i in 0..n {
                x[i] += alpha * p[i];
                r[i] -= alpha * ap[i];
                z[i] = r[i] / self.diag[i];
            }
            let next_rz: f64 = r.iter().zip(&z).map(|(a, b)| a * b).sum();
            if !next_rz.is_finite() || next_rz < 0.0 {
                return Err(SolveError::Indefinite);
            }
            if next_rz.sqrt() <= 1e-9 * initial {
                rhs.copy_from_slice(&x);
                return Ok(());
            }
            if rz == 0.0 {
                return Err(SolveError::Indefinite);
            }
            let beta = next_rz / rz;
            for i in 0..n {
                p[i] = z[i] + beta * p[i];
            }
            rz = next_rz;
        }
        Err(SolveError::NonConverged)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sparse_and_skyline_agree_on_small_spd_system() {
        let mut sparse = SparseCg::new(3);
        let mut skyline = Skyline::new(vec![0, 0, 1]);
        for (i, j, v) in [
            (0, 0, 4.0),
            (0, 1, 1.0),
            (1, 1, 3.0),
            (1, 2, 1.0),
            (2, 2, 2.0),
        ] {
            sparse.add(i, j, v);
            skyline.add(i, j, v);
        }
        sparse.factor().unwrap();
        skyline.factor(1e-12).unwrap();
        let mut b1 = vec![1.0, 2.0, 3.0];
        let mut b2 = b1.clone();
        sparse.solve(&mut b1).unwrap();
        skyline.solve(&mut b2);
        for (a, b) in b1.iter().zip(b2) {
            assert!((a - b).abs() < 1e-10);
        }
    }

    #[test]
    fn automatically_avoids_huge_skyline_allocation() {
        let first = vec![0; 3000];
        let matrix = Matrix::new(first);
        assert_eq!(matrix.backend(), "sparse_pcg_jacobi");
    }

    #[test]
    fn sparse_solver_large_diagonal_case_stays_exact() {
        let n = 3000;
        let mut matrix = Matrix::new(vec![0; n]);
        assert_eq!(matrix.backend(), "sparse_pcg_jacobi");
        for i in 0..n { matrix.add(i, i, 2.0); }
        matrix.factor(1e-11).unwrap();
        let mut rhs = vec![4.0; n];
        matrix.solve(&mut rhs).unwrap();
        assert!(rhs.iter().all(|v| (*v - 2.0).abs() < 1e-11));
    }

    #[test]
    fn huge_skyline_estimate_does_not_overflow_wasm32() {
        assert_eq!(Matrix::new(vec![0; 100_000]).backend(), "sparse_pcg_jacobi");
    }

    #[test]
    fn refuses_missing_diagonal_stiffness() {
        let mut m = SparseCg::new(2);
        m.add(0, 0, 2.0);
        assert_eq!(m.factor(), Err(Singular { dof: 1 }));
    }
}
