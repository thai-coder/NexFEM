//! Ma trận đối xứng lưu dạng skyline (profile) và phân tích Cholesky K = UᵀU.

/// Ma trận đối xứng n×n: mỗi cột j lưu các hàng first[j]..=j (tam giác trên).
pub struct Skyline {
    first: Vec<usize>,
    ptr: Vec<usize>,
    data: Vec<f64>,
}

/// Bậc tự do làm ma trận suy biến (kết cấu mất ổn định tại đó).
#[derive(Debug, Clone, PartialEq)]
pub struct Singular {
    pub dof: usize,
}

impl Skyline {
    /// `first[j]`: chỉ số hàng nhỏ nhất khác 0 ở cột j (≤ j).
    pub fn new(first: Vec<usize>) -> Self {
        let mut ptr = Vec::with_capacity(first.len() + 1);
        ptr.push(0);
        for (j, &f) in first.iter().enumerate() {
            debug_assert!(f <= j);
            ptr.push(ptr[j] + (j - f + 1));
        }
        let len = *ptr.last().unwrap();
        Skyline {
            first,
            ptr,
            data: vec![0.0; len],
        }
    }

    pub fn n(&self) -> usize {
        self.first.len()
    }

    /// Số phần tử lưu trữ (kích thước profile).
    pub fn profile(&self) -> usize {
        self.data.len()
    }

    #[inline]
    fn idx(&self, i: usize, j: usize) -> usize {
        self.ptr[j] + (i - self.first[j])
    }

    /// Cộng vào phần tử (i, j); tự đổi về tam giác trên.
    pub fn add(&mut self, i: usize, j: usize, v: f64) {
        let (i, j) = if i <= j { (i, j) } else { (j, i) };
        assert!(i >= self.first[j], "phần tử ({i},{j}) nằm ngoài profile");
        let k = self.idx(i, j);
        self.data[k] += v;
    }

    pub fn get(&self, i: usize, j: usize) -> f64 {
        let (i, j) = if i <= j { (i, j) } else { (j, i) };
        if i < self.first[j] {
            0.0
        } else {
            self.data[self.idx(i, j)]
        }
    }

    /// Phân tích Cholesky tại chỗ. Trụ ≤ `rel_tol` × đường chéo ban đầu được coi là suy biến.
    pub fn factor(&mut self, rel_tol: f64) -> Result<(), Singular> {
        let n = self.n();
        for j in 0..n {
            let fj = self.first[j];
            let diag0 = self.get(j, j).abs();
            for i in fj..=j {
                let fi = self.first[i];
                let k0 = fi.max(fj);
                let mut s = self.data[self.idx(i, j)];
                let (bi, bj) = (self.ptr[i] + (k0 - fi), self.ptr[j] + (k0 - fj));
                for k in 0..(i - k0) {
                    s -= self.data[bi + k] * self.data[bj + k];
                }
                if i < j {
                    let d = self.data[self.idx(i, i)];
                    let at = self.idx(i, j);
                    self.data[at] = s / d;
                } else {
                    // Viết dạng "không lớn hơn" để NaN cũng bị coi là suy biến.
                    if s.partial_cmp(&(rel_tol * diag0.max(f64::MIN_POSITIVE)))
                        != Some(std::cmp::Ordering::Greater)
                        || !s.is_finite()
                    {
                        return Err(Singular { dof: j });
                    }
                    let at = self.idx(j, j);
                    self.data[at] = s.sqrt();
                }
            }
        }
        Ok(())
    }

    /// Giải UᵀU x = b (sau khi `factor`). b bị thay bằng x.
    pub fn solve(&self, b: &mut [f64]) {
        let n = self.n();
        for j in 0..n {
            let fj = self.first[j];
            let mut s = b[j];
            for k in fj..j {
                s -= self.data[self.idx(k, j)] * b[k];
            }
            b[j] = s / self.data[self.idx(j, j)];
        }
        for j in (0..n).rev() {
            b[j] /= self.data[self.idx(j, j)];
            let xj = b[j];
            for k in self.first[j]..j {
                b[k] -= self.data[self.idx(k, j)] * xj;
            }
        }
    }
}

/// Thứ tự Cuthill–McKee ngược cho đồ thị kề `adj` (giảm bề rộng dải).
pub fn reverse_cuthill_mckee(adj: &[Vec<usize>]) -> Vec<usize> {
    let n = adj.len();
    let mut visited = vec![false; n];
    let mut order = Vec::with_capacity(n);
    let degree = |v: usize| adj[v].len();
    while order.len() < n {
        // Bắt đầu từ đỉnh chưa thăm có bậc nhỏ nhất.
        let start = (0..n)
            .filter(|&v| !visited[v])
            .min_by_key(|&v| degree(v))
            .unwrap();
        let mut queue = std::collections::VecDeque::from([start]);
        visited[start] = true;
        while let Some(v) = queue.pop_front() {
            order.push(v);
            let mut nb: Vec<usize> = adj[v].iter().copied().filter(|&w| !visited[w]).collect();
            nb.sort_by_key(|&w| degree(w));
            nb.dedup();
            for w in nb {
                if !visited[w] {
                    visited[w] = true;
                    queue.push_back(w);
                }
            }
        }
    }
    order.reverse();
    order
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solves_small_spd_system() {
        // [4 1 0; 1 3 1; 0 1 2] x = [1 2 3]
        let mut k = Skyline::new(vec![0, 0, 1]);
        for (i, j, v) in [
            (0, 0, 4.0),
            (0, 1, 1.0),
            (1, 1, 3.0),
            (1, 2, 1.0),
            (2, 2, 2.0),
        ] {
            k.add(i, j, v);
        }
        k.factor(1e-12).unwrap();
        let mut b = vec![1.0, 2.0, 3.0];
        k.solve(&mut b);
        let r = [
            4.0 * b[0] + b[1] - 1.0,
            b[0] + 3.0 * b[1] + b[2] - 2.0,
            b[1] + 2.0 * b[2] - 3.0,
        ];
        assert!(r.iter().all(|x| x.abs() < 1e-12), "{r:?}");
    }

    #[test]
    fn detects_singular() {
        let mut k = Skyline::new(vec![0, 0]);
        for (i, j, v) in [(0, 0, 1.0), (0, 1, 1.0), (1, 1, 1.0)] {
            k.add(i, j, v);
        }
        assert_eq!(k.factor(1e-10), Err(Singular { dof: 1 }));
    }

    #[test]
    fn rcm_orders_all_vertices() {
        let adj = vec![vec![3], vec![2], vec![1, 3], vec![0, 2]];
        let mut o = reverse_cuthill_mckee(&adj);
        o.sort();
        assert_eq!(o, vec![0, 1, 2, 3]);
    }
}
