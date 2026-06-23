# YB Music | Youtube Background Player

**Nghe nhạc Youtube chạy ngầm dưới nền, loại bỏ video để tiết kiệm RAM & CPU, không lo gián đoạn khi làm việc!**

Công cụ biến Youtube thành một trình phát nhạc thuần túy, có hỗ trợ Mini Player thu gọn và quản lý Playlist tiện lợi.

---

## Về tác giả: Lê Quốc Huy Digi

1. Chào các bạn mình là **Lê Quốc Huy** hay thường viết tắt là **Huy Digi**
2. Mình chuyên triển khai các dự án web Wordpress, PHP từ 2016 và chuyển sang phát triển các Workflow Automation như n8n và ứng dụng với AI từ 2025.
3. Theo dõi kênh Youtube của mình để không bỏ lỡ những update & thủ thuật công nghệ thông tin & AI mới nhất từ mình nhé 👉 [https://www.youtube.com/@huydigi](https://www.youtube.com/@huydigi)
4. Tham khảo thêm các công cụ phần mềm khác của mình tại 👉 [https://github.com/lequochuydigi/](https://github.com/lequochuydigi/)
5. Bạn có thể inbox cho mình tại Facebook, ae cafe giao lưu tại Hà Nội 👉 [https://www.facebook.com/lequochuydigi/](https://www.facebook.com/lequochuydigi/)

---

## Tải về & Sử dụng (Dành cho người dùng Windows)

Rất đơn giản, bạn không cần phải am hiểu về code. Chỉ cần làm theo 2 bước sau:

1. **Tải file cài đặt:** Truy cập vào mục [Releases](https://github.com/lequochuydigi/YBMusic/releases) của trang này, tải về file có tên `YB Music Setup [phiên bản].exe` mới nhất.
2. **Cài đặt & Dùng luôn:** Nhấn đúp chuột vào file `.exe` vừa tải về để cài đặt. Ứng dụng sẽ tự động mở lên và bạn có thể nghe nhạc ngay lập tức.
   - Ứng dụng sẽ có biểu tượng (icon) ở góc phải màn hình dưới thanh Taskbar.
   - Ứng dụng có chức năng **Auto-Update**, mỗi khi Huy Digi có bản cập nhật tính năng mới, phần mềm sẽ tự động tải về ngầm và cập nhật cho bạn vào lần mở app tiếp theo!

---

## Các tính năng nổi bật

| | |
|---|---|
| **Chạy ngầm (Background)** | Nghe nhạc thả ga không cần mở trình duyệt, không sợ lỡ tay tắt nhầm tab. |
| **Giao diện Khám Phá** | Cập nhật các bài hát thịnh hành, playlist tập trung làm việc (Focus), Lofi chill. |
| **Mini Player** | Cửa sổ nhỏ gọn gàng nổi trên màn hình, giúp dễ dàng Pause/Next bài. |
| **Phím tắt toàn cầu** | Hỗ trợ các phím Play/Pause/Next/Prev trên bàn phím máy tính hoặc Stream Deck kể cả khi đang mở ứng dụng khác. |
| **Đồng bộ hóa Điện thoại** | Quét mã QR để điều khiển từ xa qua điện thoại chung mạng Wifi. |
| **Siêu nhẹ** | Bỏ qua hoàn toàn việc tải luồng Video của Youtube, chỉ tải luồng Audio chất lượng cao, giúp tiết kiệm băng thông và RAM. |

---

## Cấu trúc mã nguồn (Dành cho Developer)

```
YBMusic/
├── app.js              ← Logic frontend chính (Quản lý Player, Playlist, DOM)
├── server.js           ← Backend API fetch dữ liệu từ Youtube (ytdl-core, yt-search)
├── main.js             ← Electron Desktop App (Cửa sổ chính, Auto-Updater, System Tray)
├── index.html          ← Giao diện chính (Desktop/Mobile)
├── mini.html           ← Giao diện Mini Player
├── sw.js               ← Service Worker xử lý bộ nhớ đệm (Cache)
├── package.json        ← Thông tin dự án & Auto-update config
└── scripts/            ← Các file hỗ trợ build & get dữ liệu Youtube
```

## Chạy dưới dạng Development

Nếu bạn muốn tùy chỉnh mã nguồn:
1. Yêu cầu có `Node.js` cài sẵn trên máy.
2. Clone repo này về máy.
3. Chạy lệnh: `npm install`
4. Để mở giao diện web: `npm run dev`
5. Để mở ứng dụng Desktop: `npm start`
6. Để build ra file `.exe`: `npm run build`
