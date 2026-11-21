# Báo cáo đối chiếu giải tích — nhập file CSI → bộ giải NexFEM

Sinh tự động bởi `packages/io-formats/test/csi-benchmarks.test.ts` (đặt `CSI_BENCH_REPORT`). Đừng sửa tay.

> **Phạm vi.** Đây là đối chiếu với **nghiệm đóng (giải tích)**, không phải với kết quả ETABS/SAP2000. File `.s2k` đầu vào là tổng hợp, dựng theo tên bảng/trường của file SAP2000 thật. Ca đạt chỉ chứng minh đường nhập + bộ giải khớp lý thuyết trong dung sai ghi dưới đây; không chứng minh tương đương CSI (xem `tests/benchmarks/csi/manifest.json`: kết quả CSI thật vẫn *pending*).

## Ma trận độ phủ

| Ca | Phân loại | Chỉ số | Đạt | Cân bằng tải−phản lực |
|---|---|---|---|---|
| `cantilever-hinge-span` | analytic-exact | 9/9 | ✔ | 1.4e-14 |
| `cantilever-tip-load` | analytic-exact | 15/15 | ✔ | 1.4e-14 |
| `fixed-fixed-midspan-point` | analytic-exact | 7/7 | ✔ | 3.6e-15 |
| `portal-lateral` | analytic-approximate | 5/5 | ✔ | 8.2e-14 |
| `simply-supported-udl` | analytic-exact | 7/7 | ✔ | 0.0e+0 |

`analytic-exact`: nghiệm đóng đúng cho phần tử dầm Euler–Bernoulli (sai số chỉ là làm tròn; dung sai tương đối 1e-6). `analytic-approximate`: công thức bỏ qua một hiệu ứng mà mô hình NexFEM có kể; dung sai nới theo chặn trên của hiệu ứng đó.

## Chưa so sánh được (`not comparable`)

- Kết quả ETABS/SAP2000 thật (chuyển vị, phản lực, nội lực): chưa có bảng xuất độc lập → chặn.
- Quy ước dấu nội lực CSI còn chờ đối chiếu. Ca công xôn kiểm tra M2 và M3 theo trục địa phương của NexFEM.
- Sàn/vách (shell), diaphragm cứng, P-Delta, dao động và offset đầu thanh nằm ngoài phạm vi bộ benchmark này.
- NexFEM tính biến dạng cắt khi tiết diện có `shearAreas`. Các ca ở đây dùng dầm Euler–Bernoulli; khi so với CSI, cần đối chiếu diện tích chịu cắt AS2/AS3 trước khi đặt dung sai chuyển vị.
- Đường nhập `.e2k`: chưa có ca giải tích ETABS ở bộ này (cú pháp `POINTASSIGN RESTRAINT` chưa có trong file ETABS thật).

## cantilever-hinge-span

Hai nhịp 6 m: thanh 1 ngàm tại nút 1, thanh 2 có nhả mômen M3 ở đầu I (khớp tại nút 2), gối khớp tại nút 3; tải đều w = 5 kN/m cả hai thanh.

- Cơ sở: Tĩnh định: thanh 2 là dầm đơn giản (phản lực wL/2 truyền xuống đầu thanh 1). Fz(1) = 1.5wL; M ngàm = −wL²; δ(2) = −(wL⁴/8EI + (wL/2)L³/3EI) = −7wL⁴/24EI; θy(2) = 5wL³/12EI; θy(3) = −wL³/3EI; M3 khớp = 0; M3 giữa thanh 2 = wL²/8.

| Chỉ số | Chuẩn | NexFEM | Sai số tuyệt đối | Sai số tương đối | Cho phép | |
|---|---|---|---|---|---|---|
| displacement · 2 · U3 | -0.008859375 | -0.008859375 | 6.939e-18 | 7.8e-16 | 8.859e-9 | ✔ |
| displacement · 2 · R2 | 0.002109375 | 0.002109375 | 1.735e-18 | 8.2e-16 | 2.109e-9 | ✔ |
| displacement · 3 · R2 | -0.0016875 | -0.0016875 | 1.518e-18 | 9.0e-16 | 1.687e-9 | ✔ |
| reaction · 1 · F3 | 45 | 45 | 1.421e-14 | 3.2e-16 | 4.500e-5 | ✔ |
| reaction · 1 · M2 | -180 | -180 | 8.527e-14 | 4.7e-16 | 1.800e-4 | ✔ |
| reaction · 3 · F3 | 15 | 15 | 3.553e-15 | 2.4e-16 | 1.500e-5 | ✔ |
| frameForce · 1@x=0 · M3 | -180 | -180 | 8.527e-14 | 4.7e-16 | 1.800e-4 | ✔ |
| frameForce · 2@x=0 · M3 | 0 | 0 | 0 | — | 1.000e-8 | ✔ |
| frameForce · 2@x=3 · M3 | 22.5 | 22.5 | 1.421e-14 | 6.3e-16 | 2.250e-5 | ✔ |

## cantilever-tip-load

Công xôn L = 6 m dọc +X. Hai ca độc lập đặt 10 kN tại đầu tự do: P theo −Z, PY theo +Y.

- Cơ sở: P: Uz = −PL³/(3EI33), θy = PL²/(2EI33), Fz = P, My = −PL, M3(x) = −P(L−x). PY: Uy = PL³/(3EI22), θz = PL²/(2EI22), Fy = −P, Mz = −PL. Trục địa phương 2 = +Z và 3 = −Y, nên nội lực NexFEM trên mặt cắt dương là M2(x) = P(L−x) và V3(x) = −P.

| Chỉ số | Chuẩn | NexFEM | Sai số tuyệt đối | Sai số tương đối | Cho phép | |
|---|---|---|---|---|---|---|
| displacement · 2 · U3 | -0.003375 | -0.003375 | 3.469e-18 | 1.0e-15 | 3.375e-9 | ✔ |
| displacement · 2 · R2 | 8.437e-4 | 8.437e-4 | 7.589e-19 | 9.0e-16 | 8.437e-10 | ✔ |
| reaction · 1 · F3 | 10 | 10 | 1.421e-14 | 1.4e-15 | 1.000e-5 | ✔ |
| reaction · 1 · M2 | -60 | -60 | 5.684e-14 | 9.5e-16 | 6.000e-5 | ✔ |
| frameForce · 1@x=0 · M3 | -60 | -60 | 5.684e-14 | 9.5e-16 | 6.000e-5 | ✔ |
| frameForce · 1@x=3 · M3 | -30 | -30 | 1.421e-14 | 4.7e-16 | 3.000e-5 | ✔ |
| frameForce · 1@x=6 · M3 | 0 | -2.842e-14 | 2.842e-14 | — | 1.000e-8 | ✔ |
| displacement · 2 · U2 | 0.0135 | 0.0135 | 1.388e-17 | 1.0e-15 | 1.350e-8 | ✔ |
| displacement · 2 · R3 | 0.003375 | 0.003375 | 3.036e-18 | 9.0e-16 | 3.375e-9 | ✔ |
| reaction · 1 · F2 | -10 | -10 | 1.421e-14 | 1.4e-15 | 1.000e-5 | ✔ |
| reaction · 1 · M3 | -60 | -60 | 5.684e-14 | 9.5e-16 | 6.000e-5 | ✔ |
| frameForce · 1@x=0 · M2 | 60 | 60 | 5.684e-14 | 9.5e-16 | 6.000e-5 | ✔ |
| frameForce · 1@x=3 · M2 | 30 | 30 | 1.421e-14 | 4.7e-16 | 3.000e-5 | ✔ |
| frameForce · 1@x=6 · M2 | 0 | 2.842e-14 | 2.842e-14 | — | 1.000e-8 | ✔ |
| frameForce · 1@x=3 · V3 | -10 | -10 | 1.421e-14 | 1.4e-15 | 1.000e-5 | ✔ |

## fixed-fixed-midspan-point

Dầm hai đầu ngàm L = 6 m, lực tập trung P = 20 kN hướng xuống tại giữa nhịp (hai thanh nối tại nút giữa).

- Cơ sở: δ = PL³/192EI; Fz = P/2; mômen ngàm = PL/8 (hogging; My = −PL/8 ở đầu trái, +PL/8 ở đầu phải); M3 giữa nhịp = +PL/8.

| Chỉ số | Chuẩn | NexFEM | Sai số tuyệt đối | Sai số tương đối | Cho phép | |
|---|---|---|---|---|---|---|
| displacement · 2 · U3 | -1.055e-4 | -1.055e-4 | 4.066e-20 | 3.9e-16 | 1.055e-10 | ✔ |
| reaction · 1 · F3 | 10 | 10 | 1.776e-15 | 1.8e-16 | 1.000e-5 | ✔ |
| reaction · 3 · F3 | 10 | 10 | 1.776e-15 | 1.8e-16 | 1.000e-5 | ✔ |
| reaction · 1 · M2 | -15 | -15 | 1.776e-15 | 1.2e-16 | 1.500e-5 | ✔ |
| reaction · 3 · M2 | 15 | 15 | 1.776e-15 | 1.2e-16 | 1.500e-5 | ✔ |
| frameForce · 1@x=0 · M3 | -15 | -15 | 1.776e-15 | 1.2e-16 | 1.500e-5 | ✔ |
| frameForce · 1@x=3 · M3 | 15 | 15 | 5.329e-15 | 3.6e-16 | 1.500e-5 | ✔ |

## portal-lateral

Khung cổng một nhịp: cột h = 4 m, dầm L = 6 m, cùng EI, chân ngàm; lực ngang H = 10 kN tại nút trên trái (3D, trong mặt phẳng XZ).

- Cơ sở: Phương trình góc xoay-độ võng, bỏ qua biến dạng dọc trục: θ = 6ψ/(4+6h/L), Δ = H·h³(4+x)/(24EI(1+x)) với x = 6h/L, M chân cột = 2EI/h·(θ − 3ψ). Tổng phản lực ngang = −H (cân bằng, chính xác).
- Giới hạn: Công thức đóng bỏ qua biến dạng dọc trục; mô hình NexFEM có kể dọc trục nên chênh ≤ ~1%. Đây là chênh lệch giả thiết mô hình, không phải sai số bộ giải.

| Chỉ số | Chuẩn | NexFEM | Sai số tuyệt đối | Sai số tương đối | Cho phép | |
|---|---|---|---|---|---|---|
| displacement · mean(2,3) · U1 | 2.000e-4 | 2.004e-4 | 3.551e-7 | 1.8e-3 | 2.000e-6 | ✔ |
| reaction · sum(1,4) · F1 | -10 | -10 | 8.171e-14 | 8.2e-15 | 1.000e-5 | ✔ |
| reaction · sum(1,4) · F3 | 0 | 8.882e-16 | 8.882e-16 | — | 1.000e-8 | ✔ |
| reaction · mean(1,4) · M2 | -12 | -12.00947 | 0.009470257 | 7.9e-4 | 0.12 | ✔ |
| reaction · 4 · F3 | 2.666667 | 2.66351 | 0.003156752 | 1.2e-3 | 0.02666667 | ✔ |

## simply-supported-udl

Dầm đơn giản L = 6 m, tải phân bố đều w = 5 kN/m hướng xuống (gối khớp + gối trượt dọc trục).

- Cơ sở: R = wL/2; θ(0) = +wL³/24EI, θ(L) = −wL³/24EI; M3(x) = wx(L−x)/2 (căng thớ dưới là dương).

| Chỉ số | Chuẩn | NexFEM | Sai số tuyệt đối | Sai số tương đối | Cho phép | |
|---|---|---|---|---|---|---|
| reaction · 1 · F3 | 15 | 15 | 1.776e-15 | 1.2e-16 | 1.500e-5 | ✔ |
| reaction · 2 · F3 | 15 | 15 | 1.776e-15 | 1.2e-16 | 1.500e-5 | ✔ |
| displacement · 1 · R2 | 2.109e-4 | 2.109e-4 | 1.084e-19 | 5.1e-16 | 2.109e-10 | ✔ |
| displacement · 2 · R2 | -2.109e-4 | -2.109e-4 | 5.421e-20 | 2.6e-16 | 2.109e-10 | ✔ |
| frameForce · 1@x=1.5 · M3 | 16.875 | 16.875 | 3.553e-15 | 2.1e-16 | 1.688e-5 | ✔ |
| frameForce · 1@x=3 · M3 | 22.5 | 22.5 | 0 | 0.0e+0 | 2.250e-5 | ✔ |
| frameForce · 1@x=6 · M3 | 0 | 0 | 0 | — | 1.000e-8 | ✔ |

