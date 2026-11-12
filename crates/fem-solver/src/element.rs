//! Phần tử thanh 3D Euler–Bernoulli: độ cứng cục bộ, trục cục bộ, tải tương đương, nhả liên kết.
//! Bậc tự do cục bộ: [u1 u2 u3 θ1 θ2 θ3] tại đầu i, rồi tại đầu j.

pub type V3 = [f64; 3];
pub type M12 = [[f64; 12]; 12];

pub fn sub(a: V3, b: V3) -> V3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
pub fn dot(a: V3, b: V3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
pub fn cross(a: V3, b: V3) -> V3 {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
pub fn norm(a: V3) -> f64 {
    dot(a, a).sqrt()
}
pub fn scale(a: V3, s: f64) -> V3 {
    [a[0] * s, a[1] * s, a[2] * s]
}

/// Trục cục bộ (các hàng là e1, e2, e3).
/// e1 dọc thanh i→j. Thanh không thẳng đứng: e2 hướng lên trong mặt phẳng đứng chứa thanh.
/// Thanh thẳng đứng: e2 = X tổng thể. e3 = e1 × e2.
pub fn local_axes(a: V3, b: V3) -> [V3; 3] {
    let d = sub(b, a);
    let l = norm(d);
    let e1 = scale(d, 1.0 / l);
    let e2 = if e1[2].abs() > 1.0 - 1e-6 {
        [1.0, 0.0, 0.0]
    } else {
        let z = [0.0, 0.0, 1.0];
        let p = sub(z, scale(e1, e1[2]));
        scale(p, 1.0 / norm(p))
    };
    [e1, e2, cross(e1, e2)]
}

pub struct SectionProps {
    pub e: f64,
    pub g: f64,
    pub a: f64,
    pub i22: f64,
    pub i33: f64,
    pub j: f64,
}

/// Ma trận độ cứng cục bộ 12×12.
pub fn local_stiffness(p: &SectionProps, l: f64) -> M12 {
    local_stiffness_with_shear(p, l, None)
}

/// Timoshenko khi cung cấp diện tích chịu cắt hữu hiệu [A2,A3] (m²).
/// Không có giá trị: Euler–Bernoulli chính xác như các dự án cũ.
pub fn local_stiffness_with_shear(p: &SectionProps, l: f64, shear_areas: Option<[f64; 2]>) -> M12 {
    let (phi2, phi3) = match shear_areas {
        Some([a2, a3]) => (
            12.0 * p.e * p.i33 / (p.g * a2 * l * l),
            12.0 * p.e * p.i22 / (p.g * a3 * l * l),
        ),
        None => (0.0, 0.0),
    };
    let psi2 = 1.0 / (1.0 + phi2);
    let psi3 = 1.0 / (1.0 + phi3);
    let mut k = [[0.0; 12]; 12];
    let (ea, gj) = (p.e * p.a / l, p.g * p.j / l);
    let (ez, ey) = (p.e * p.i33, p.e * p.i22);
    let (l2, l3) = (l * l, l * l * l);
    let mut set = |i: usize, j: usize, v: f64| {
        k[i][j] = v;
        k[j][i] = v;
    };
    set(0, 0, ea);
    set(0, 6, -ea);
    set(6, 6, ea);
    set(3, 3, gj);
    set(3, 9, -gj);
    set(9, 9, gj);
    // Uốn trong mặt phẳng 1-2 (u2, θ3), dùng I33.
    set(1, 1, 12.0 * ez * psi2 / l3);
    set(1, 5, 6.0 * ez * psi2 / l2);
    set(1, 7, -12.0 * ez * psi2 / l3);
    set(1, 11, 6.0 * ez * psi2 / l2);
    set(5, 5, (4.0 + phi2) * ez * psi2 / l);
    set(5, 7, -6.0 * ez * psi2 / l2);
    set(5, 11, (2.0 - phi2) * ez * psi2 / l);
    set(7, 7, 12.0 * ez * psi2 / l3);
    set(7, 11, -6.0 * ez * psi2 / l2);
    set(11, 11, (4.0 + phi2) * ez * psi2 / l);
    // Uốn trong mặt phẳng 1-3 (u3, θ2), dùng I22.
    set(2, 2, 12.0 * ey * psi3 / l3);
    set(2, 4, -6.0 * ey * psi3 / l2);
    set(2, 8, -12.0 * ey * psi3 / l3);
    set(2, 10, -6.0 * ey * psi3 / l2);
    set(4, 4, (4.0 + phi3) * ey * psi3 / l);
    set(4, 8, 6.0 * ey * psi3 / l2);
    set(4, 10, (2.0 - phi3) * ey * psi3 / l);
    set(8, 8, 12.0 * ey * psi3 / l3);
    set(8, 10, 6.0 * ey * psi3 / l2);
    set(10, 10, (4.0 + phi3) * ey * psi3 / l);
    k
}

/// Tải tương đương tại nút (cục bộ) của tải phân bố đều w = (w1, w2, w3) trên cả chiều dài.
pub fn uniform_feq(w: V3, l: f64) -> [f64; 12] {
    let (h, m) = (l / 2.0, l * l / 12.0);
    [
        w[0] * h,
        w[1] * h,
        w[2] * h,
        0.0,
        -w[2] * m,
        w[1] * m,
        w[0] * h,
        w[1] * h,
        w[2] * h,
        0.0,
        w[2] * m,
        -w[1] * m,
    ]
}

/// Tải tương đương tại nút (cục bộ) của lực tập trung p = (p1, p2, p3) cách đầu i một đoạn a.
pub fn point_feq(p: V3, a: f64, l: f64) -> [f64; 12] {
    let b = l - a;
    let l2 = l * l;
    let l3 = l2 * l;
    let fi = b * b * (3.0 * a + b) / l3;
    let fj = a * a * (a + 3.0 * b) / l3;
    let mi = a * b * b / l2;
    let mj = a * a * b / l2;
    [
        p[0] * b / l,
        p[1] * fi,
        p[2] * fi,
        0.0,
        -p[2] * mi,
        p[1] * mi,
        p[0] * a / l,
        p[1] * fj,
        p[2] * fj,
        0.0,
        p[2] * mj,
        -p[1] * mj,
    ]
}

/// Ngưng tụ tĩnh các bậc tự do được nhả (`released[k]` = true): trả về k và f đã ngưng tụ,
/// hàng/cột bị nhả bằng 0.
pub fn condense(
    k: &M12,
    f: &[f64; 12],
    released: &[bool; 12],
) -> Result<(M12, [f64; 12]), &'static str> {
    let r: Vec<usize> = (0..12).filter(|&i| released[i]).collect();
    if r.is_empty() {
        return Ok((*k, *f));
    }
    let c: Vec<usize> = (0..12).filter(|&i| !released[i]).collect();
    let nr = r.len();
    let scale = r.iter().map(|&i| k[i][i].abs()).fold(0.0_f64, f64::max);
    if !scale.is_finite() || scale == 0.0 {
        return Err("Ma trận releases không khả nghịch");
    }
    // Krr⁻¹ bằng khử Gauss trên ma trận nhỏ.
    let mut aug: Vec<Vec<f64>> = (0..nr)
        .map(|a| {
            let mut row: Vec<f64> = r.iter().map(|&b| k[r[a]][b]).collect();
            row.extend((0..nr).map(|b| if a == b { 1.0 } else { 0.0 }));
            row
        })
        .collect();
    for col in 0..nr {
        let piv = (col..nr)
            .max_by(|&x, &y| aug[x][col].abs().total_cmp(&aug[y][col].abs()))
            .unwrap();
        aug.swap(col, piv);
        let d = aug[col][col];
        if !d.is_finite() || d.abs() <= scale * 1e-14 {
            // Không được âm thầm dùng độ cứng thanh chưa nhả liên kết.
            return Err("Ma trận releases không khả nghịch");
        }
        for v in aug[col].iter_mut() {
            *v /= d;
        }
        for row in 0..nr {
            if row != col {
                let m = aug[row][col];
                if m != 0.0 {
                    let pivot_row = aug[col].clone();
                    for (x, p) in aug[row].iter_mut().zip(pivot_row) {
                        *x -= m * p;
                    }
                }
            }
        }
    }
    let inv = |a: usize, b: usize| aug[a][nr + b];
    let mut kc = [[0.0; 12]; 12];
    let mut fc = [0.0; 12];
    for &i in &c {
        let mut fi = f[i];
        for (a, &ra) in r.iter().enumerate() {
            for (b, &rb) in r.iter().enumerate() {
                fi -= k[i][ra] * inv(a, b) * f[rb];
            }
        }
        fc[i] = fi;
        for &j in &c {
            let mut v = k[i][j];
            for (a, &ra) in r.iter().enumerate() {
                for (b, &rb) in r.iter().enumerate() {
                    v -= k[i][ra] * inv(a, b) * k[rb][j];
                }
            }
            kc[i][j] = v;
        }
    }
    Ok((kc, fc))
}

/// Đổi vector 12 từ cục bộ sang tổng thể: g = Tᵀ l.
pub fn to_global(ax: &[V3; 3], l: &[f64; 12]) -> [f64; 12] {
    let mut g = [0.0; 12];
    for blk in 0..4 {
        for c in 0..3 {
            g[blk * 3 + c] = (0..3).map(|r| ax[r][c] * l[blk * 3 + r]).sum();
        }
    }
    g
}

/// Đổi vector 12 từ tổng thể sang cục bộ: l = T g.
pub fn to_local(ax: &[V3; 3], g: &[f64; 12]) -> [f64; 12] {
    let mut l = [0.0; 12];
    for blk in 0..4 {
        for r in 0..3 {
            l[blk * 3 + r] = (0..3).map(|c| ax[r][c] * g[blk * 3 + c]).sum();
        }
    }
    l
}

/// k tổng thể = Tᵀ k T.
pub fn stiffness_to_global(ax: &[V3; 3], k: &M12) -> M12 {
    // kt = k T
    let mut kt = [[0.0; 12]; 12];
    for i in 0..12 {
        for bj in 0..4 {
            for c in 0..3 {
                kt[i][bj * 3 + c] = (0..3).map(|r| k[i][bj * 3 + r] * ax[r][c]).sum();
            }
        }
    }
    let mut g = [[0.0; 12]; 12];
    for bi in 0..4 {
        for c in 0..3 {
            for j in 0..12 {
                g[bi * 3 + c][j] = (0..3).map(|r| ax[r][c] * kt[bi * 3 + r][j]).sum();
            }
        }
    }
    g
}
