# kiln — Brand & Theme Guideline

Hệ nhận diện cho project AI-DLC. Bảng màu: **Graphite & amber**.

Nguyên tắc chi phối toàn bộ tài liệu này: **ba neutral, một accent**. Amber là màu duy nhất có bão hòa cao trong hệ. Mỗi lần bạn định thêm màu thứ hai, hãy kiểm tra xem có thể diễn đạt bằng độ đậm của graphite không.

---

## 1. Màu

### Graphite — neutral ám ấm

| Token | Hex | Dùng cho |
|---|---|---|
| `graphite-25` | `#F7F5F0` | Nền light mode |
| `graphite-50` | `#EDEAE3` | Chữ chính trên nền tối |
| `graphite-100` | `#DEDBD4` | Nền raised (light) |
| `graphite-200` | `#C9C5BD` | Đường viền (light) |
| `graphite-300` | `#A5A099` | Chữ phụ trên nền tối |
| `graphite-400` | `#7C776E` | Chữ mờ, icon phụ |
| `graphite-500` | `#5C5852` | Chữ phụ trên nền sáng |
| `graphite-600` | `#4A4642` | Viền đậm (dark) |
| `graphite-700` | `#3A3733` | Viền (dark) |
| `graphite-800` | `#2A2724` | Card, panel (dark) |
| `graphite-900` | `#1C1A18` | Surface (dark), chữ chính (light) |
| `graphite-950` | `#131211` | Nền dark mode |

Graphite ở đây **không phải xám trung tính** — nó ám nâu nhẹ. Đừng thay bằng `#000000` hay xám Tailwind mặc định, vì đó chính là thứ làm hệ mất chất ấm và trông như template.

### Amber — accent duy nhất

| Token | Hex | Dùng cho |
|---|---|---|
| `amber-500` | `#FFB020` | Fill primary, vạch gate của logo |
| `amber-400` | `#FFC24D` | Hover |
| `amber-600` | `#E09512` | Pressed |
| `amber-700` | `#B0730B` | Mark trên nền sáng |
| `amber-800` | `#7A4E08` | **Chữ và link trên nền sáng** |
| `amber-900` | `#3D2A02` | Chữ nằm trên nền amber |
| `amber-100` | `#FFF0D1` | Nền tint nhạt (light) |

### Quy tắc contrast — đọc kỹ phần này

`#FFB020` trên nền sáng chỉ đạt **1.5:1**. Nó là màu **fill**, không phải màu chữ.

- Nền tối: amber-500 làm chữ được (≈9.6:1 trên graphite-950)
- Nền sáng: chữ và link phải dùng **amber-800** (≈5.6:1). Không bao giờ dùng amber-500 cho text trên nền sáng
- Chữ nằm trên nút amber: luôn là amber-900, không dùng trắng
- Chữ phụ: graphite-500 trên nền sáng, graphite-300 trên nền tối

### Tỉ lệ

60% neutral nền — 30% neutral chữ và viền — 10% amber. Nếu ảnh chụp màn hình có hơn hai vùng amber lớn, tức là đã dùng quá tay.

### Semantic

| Vai trò | Hex | Ghi chú |
|---|---|---|
| Danger | `#E5533D` | Đỏ ám cam, không dùng đỏ thuần |
| Warning | `#D9822B` | Cam đất — cố ý tách khỏi amber thương hiệu |
| Success | `#8AA35A` | Sage trầm |

Amber **không** được dùng làm màu warning. Trong hệ này amber mang nghĩa "đã được người duyệt", nếu nó cũng có nghĩa "cảnh báo" thì mất luôn tín hiệu.

Về ngũ hành: sage ở mục Success thuộc Mộc, là hành khắc Thổ. Giữ nó ở liều rất nhỏ — chấm trạng thái, icon check, badge nhỏ. Không dùng làm nền mảng lớn. Nếu muốn triệt để thì thay Success bằng amber-500 và phân biệt trạng thái bằng icon thay vì màu.

---

## 2. Chữ

| Vai trò | Font | Ghi chú |
|---|---|---|
| UI, heading, wordmark | Inter Tight | Tracking âm nhẹ ở cỡ lớn |
| Body, văn bản dài | Inter | |
| Code, CLI, số liệu | JetBrains Mono | |

Type scale: 12 / 13 / 15 / 18 / 22 / 28 / 38. Chỉ dùng hai độ đậm: 400 và 500. Đừng dùng 600 hay 700 — với neutral ám ấm thì chữ quá đậm trông nặng và cũ.

Heading ≥28px nên đặt `letter-spacing: -0.02em`. Body giữ 0.

---

## 3. Logo

### Cấu tạo

Mark dựng trên lưới **52×48**. Ba vạch ngang ứng với ba phase của AI-DLC — Inception, Construction, Operations. Hai vạch dưới bị đứt (agent đang chạy song song), vạch trên liền và mang màu amber (human validation gate đã đóng).

- Chiều cao vạch: 8 đơn vị, bo góc 4
- Khoảng cách giữa các hàng: 20 đơn vị
- Khe hở vạch đứt: 8 đơn vị

Đừng thay đổi các tỉ lệ này khi scale — luôn scale đồng nhất cả mark.

### Clear space

Khoảng trống tối thiểu quanh mark bằng **chiều cao một vạch × 2** (16 đơn vị trên lưới, tức 0.31 × chiều rộng mark). Không đặt chữ hay đường kẻ vào vùng này.

### Kích thước tối thiểu

- Mark đứng một mình: 20px chiều rộng
- Lockup có chữ: 88px chiều rộng
- Dưới 20px: dùng `favicon.svg` (đã làm dày vạch riêng), không thu nhỏ mark gốc

### Nên và không nên

Nên: đổi màu mark qua bản mono với `currentColor`; đặt trên nền phẳng; giữ vạch gate là vạch có độ tương phản cao nhất.

Không nên: xoay mark; đổ gradient lên vạch; thêm bóng đổ; đảo thứ tự để vạch liền xuống dưới (mất hết ý nghĩa gate); nén ngang; đặt trên ảnh nền có texture.

### Wordmark

Chữ thường, Inter Tight Medium, `letter-spacing: -0.032em`. File SVG hiện đang tham chiếu font qua `font-family`, nên **sau khi cài Inter Tight vào máy, hãy convert text sang path** rồi commit bản đã outline. Nếu không, logo sẽ render khác nhau trên máy chưa có font.

---

## 4. File

```
logo/
  kiln-mark.svg            Mark màu, dùng trên nền tối
  kiln-mark-on-light.svg   Mark màu, dùng trên nền sáng
  kiln-mark-mono.svg       Mark một màu, ăn theo currentColor
  kiln-lockup-dark.svg     Mark + wordmark, nền tối
  kiln-lockup-light.svg    Mark + wordmark, nền sáng
  kiln-app-icon.svg        512×512, tile bo góc 112
  favicon.svg              32×32, vạch đã làm dày
theme.css                  Toàn bộ CSS custom properties
tokens.json                Token dạng dữ liệu, cho Tailwind hoặc Figma
```

Nhúng favicon:

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/kiln-app-icon.svg">
```

Dùng mark mono trong React:

```jsx
<KilnMark className="text-graphite-50 dark:text-amber-500" />
```

---

## 5. Áp dụng vào giao diện AI-DLC

Vì amber mang nghĩa "đã qua human gate", hãy map trạng thái theo đúng nghĩa đó và giữ nhất quán toàn hệ:

| Trạng thái | Màu | Lý do |
|---|---|---|
| Chờ người duyệt | `amber-500` viền + `amber-100` nền | Chỗ duy nhất cần mắt người |
| Agent đang chạy | `graphite-400` | Đang hoạt động nhưng chưa cần chú ý |
| Đã xong, tự động | `graphite-300` | Lùi hẳn về sau |
| Bị chặn, lỗi | `danger` | |
| Bị bỏ qua | `graphite-200` gạch ngang | |

Hệ quả thực tế: trên một màn hình pipeline, **vùng amber chính là chỗ người dùng cần nhìn**. Nếu không có gì chờ duyệt thì màn hình gần như đơn sắc. Đó là tính năng, không phải thiếu sót — đừng thêm màu để màn hình "đỡ trống".

---

## 6. Bán kính, khoảng cách, chuyển động

Bán kính: 4 cho tag và input nhỏ, 8 cho button và field, 12 cho card, 16 cho modal và panel lớn. Không dùng bo tròn hoàn toàn trừ avatar và chấm trạng thái.

Khoảng cách: base 4px, dùng bậc 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.

Chuyển động: 120ms cho hover, 180ms cho hầu hết chuyển trạng thái, 240ms cho panel trượt. Easing duy nhất `cubic-bezier(0.2, 0, 0, 1)`. Đã có sẵn khối `prefers-reduced-motion` trong `theme.css`.

Focus ring: viền 2px màu amber, offset 2px. Không bao giờ tắt outline mà không thay bằng chỉ báo khác.
