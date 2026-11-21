//! Chạy bộ giải từ dòng lệnh: đọc JSON mô hình NexFEM từ stdin, in JSON `{ ok, results | error }`.
//! Dùng cho bộ đối chiếu `tests/benchmarks/csi` (nhập file CSI → mô hình → bộ giải).

use std::io::Read;

fn main() {
    let mut input = String::new();
    std::io::stdin()
        .read_to_string(&mut input)
        .expect("đọc stdin");
    println!("{}", fem_solver::analyze_json(&input));
}
