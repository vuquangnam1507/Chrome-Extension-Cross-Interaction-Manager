# CrossEngage

Chrome Extension Manifest V3 hỗ trợ người dùng quản lý công việc Like/Follow trên bốn trang Tuongtaccheo. React + TypeScript + Vite, Zustand cho giao diện và Chrome Storage cho trạng thái bền vững.

**Extension không tự Like, Follow, nhận xu, gửi API Facebook, vượt CAPTCHA hoặc xác minh kết quả tương tác.** Công việc được hoàn thành trong extension chỉ có nghĩa người dùng đã xác nhận.

## Cài đặt nhanh

Yêu cầu Node.js **24 LTS**, npm, Chrome 120 trở lên.

```bash
nvm use
npm ci
npm test
npm run build
```

1. Mở `chrome://extensions/`.
2. Bật **Developer mode / Chế độ dành cho nhà phát triển**.
3. Chọn **Load unpacked / Tải tiện ích đã giải nén**.
4. Chọn thư mục **dist** của dự án (không chọn `src` hoặc thư mục gốc).
5. Ghim CrossEngage lên thanh công cụ và mở popup.
6. Đăng nhập Tuongtaccheo và Facebook bằng thao tác của bạn. Bấm **Start**.
7. Sau khi cập nhật build: bấm **Reload** trong `chrome://extensions/`, tải lại tab trang nguồn để cập nhật content script.

`npm run dev` chỉ phục vụ phát triển popup. Để thử workflow thực phải build và Load unpacked, vì trang Vite thông thường không có Chrome Extension API.

## Sử dụng

- **Start** tạo tab Tuongtaccheo do extension theo dõi; lần tiếp theo có thể tái sử dụng tab gốc còn hợp lệ.
- Chọn **Mở Facebook** cho công việc hiện tại. Extension giữ mapping taskId/tabId và ưu tiên quay lại tab đã mở có đúng URL.
- Tự Like/Follow; mở lại popup rồi bấm **Tôi đã Like/Follow**. Tab Facebook được giữ nguyên.
- Với ba trang thưởng lẻ, bấm **Tìm thưởng công việc vừa xong** để quay lại và làm nổi bật nút thưởng trong container của công việc vừa xác nhận. Bạn tự nhấn nhận thưởng. Có thể tiếp tục công việc kế tiếp trong popup.
- Với `subcheofbvip`, xác nhận từng Follow. Chỉ khi **mọi** công việc trong danh sách được xác nhận, nút tìm **Nhận tất cả xu** và xác nhận thưởng nhóm mới khả dụng. Tự nhận xu ở trang nguồn, sau đó bấm **Tôi đã nhận thưởng nhóm**; extension mới chờ chuyển trang. Công việc bị bỏ qua không được coi là hoàn thành nhóm.
- **Bỏ qua trang** là quyết định chủ động rời trang, không ghi nhận nhận thưởng thành công.
- **Stop** hủy timer/alarm, vô hiệu hóa scan cũ và dừng observer. Không đóng bất kỳ tab nào. API mở/điều hướng đã được gửi trước lúc Stop không thể thu hồi; không phát hành thêm thao tác sau khi cờ Stop được ghi nhận.
- Cấu hình thứ tự, bật/tắt từng trang và khoảng chờ trong tab **Cấu hình** khi đã Stop.
- **Xóa lịch sử xử lý** khi đã Stop xóa cả tiến độ, mapping và nhật ký; giữ cấu hình và các tab hiện có.

## Những phần cần xác minh bằng HTML thật

Chưa có HTML đăng nhập thực của bốn trang. Fixture trong `tests/fixtures/` là dữ liệu kiểm thử tổng hợp, **không phải bằng chứng selector phù hợp website thật**. Logic chạy chính đọc DOM thật và storage, không có công việc giả lập.

Adapter mặc định tìm `.btn.btn-default`, kiểm tra hiển thị/disabled, loại nhãn chức năng như nhận xu/tải lại/đăng nhập, và yêu cầu trích được URL HTTPS Facebook hợp lệ. URL lấy từ `href`, `data-url`, thuộc tính được cấu hình, hoặc thẻ `a` trong container đã cấu hình. Không chạy hay phân tích tùy tiện mã `onclick`, không đoán ID Facebook.

Trong **Cấu hình → Adapter DOM nâng cao**, mỗi trang có các trường:

| Trường                     | Ý nghĩa                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `taskSelector`             | Selector ứng viên; mặc định `.btn.btn-default`. Thu hẹp vào khu vực danh sách thật nếu có nút Facebook không phải công việc. |
| `containerSelector`        | Selector container của một công việc, cần xác minh; mặc định trống.                                                          |
| `urlAttribute`             | Thuộc tính chứa URL Facebook đầy đủ nếu khác `href`/`data-url`; mặc định trống.                                              |
| `individualRewardSelector` | Selector thưởng lẻ **bên trong container công việc**; mặc định trống, không bịa selector.                                    |
| `emptySelector`            | Selector thông báo “hết công việc” đã được xác minh; mặc định trống. Không dùng container trống chung chung.                 |

Bốn trang có adapter độc lập. Sau khi kiểm tra HTML bằng DevTools, nhập selector chính xác và lưu. Nếu trang chỉ chứa hàm JavaScript/ID nội bộ không kèm URL, cần bổ sung parser có kiểm thử vào module tương ứng dựa trên HTML thực tế; hiện extension sẽ không coi nút đó là công việc.

Thưởng nhóm tìm nút/thẻ liên kết có nội dung hiển thị chính xác **Nhận tất cả xu**, có chuẩn hóa khoảng trắng và hoa/thường. Nếu không tìm được hoặc có nhiều nút phù hợp, extension báo lỗi thay vì chọn bừa. Làm nổi bật chỉ scroll và outline; không gọi `.click()`.

Không nhận diện được selector **khác** hết việc: extension đợi DOM ổn định ban đầu tối đa 4 giây rồi báo lỗi nếu chưa nhận diện được. Với trang tải lâu hơn, đợi trang xong rồi bấm **Quét lại**. Chỉ tự rời trang rỗng khi `emptySelector` đã cấu hình khớp. Kiểm tra hết một vòng các trang đang bật mà đều rỗng thì tự Stop, tránh vòng lặp không giới hạn.

## Kiến trúc

```text
src/
  popup/                  React UI, Zustand mirror, CSS
  background/
    index.ts              Listener runtime/tabs/alarms và kiểm tra nguồn message
    workflow-manager.ts   Hàng đợi tuần tự, điều phối, deadline, khôi phục
    state-machine.ts      Đồ thị chuyển trạng thái và thứ tự trang
    tab-manager.ts        Mở/focus tab, xác thực URL, chống mở trùng
  content/
    tuongtaccheo.ts        MutationObserver, scan theo vùng thay đổi, highlight
    detection.ts          Nhận diện công việc và nút thưởng
    facebook.ts           Thông báo dấu hiệu cần đăng nhập, không thao tác tương tác
  modules/                Interface chung và bốn module LIKE/FOLLOW
  services/               Storage, messaging, dedupe/hàng đợi
  config/                 Danh sách trang, cấu hình mặc định, validation
  types/                  State, Task, Settings, message types
  utils/                  Chuẩn hóa và xác thực URL Facebook
public/manifest.json      Manifest MV3
scripts/build-content.mjs Build content script IIFE riêng
 tests/                   Unit test và HTML fixture
```

Background là nơi duy nhất thay đổi state. Popup gửi command và theo dõi `storage.onChanged`; đóng popup không mất tiến độ. Mỗi command/message/timer chạy trong một hàng đợi Promise; không có nhiều workflow đồng thời. Cờ Stop được đặt ngay khi nhận command, trước hàng đợi. Báo cáo scan cần đúng tab gốc, trang, URL và token của lần scan, tránh dữ liệu cũ làm thay đổi lượt xử lý mới.

Storage dùng một bản ghi `state` có version chứa `running`, `currentPageIndex`, `currentTaskId`, `completedTasks`, `skippedTasks`, `settings`, `activityLogs`, `lastTransitionTime`, danh sách công việc, mapping tab, token và deadline. Mỗi chuyển đổi được lưu lại; nhật ký giữ tối đa 250 dòng. Lịch sử ID tồn tại đến khi người dùng xóa, nên cùng URL trên cùng loại trang không được xử lý lại tự động; một URL ở hai loại trang khác nhau có ID riêng.

### State machine

| Trạng thái             | Điều kiện chuyển tiếp chính                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `STOPPED`              | Start → `IDLE`                                                                           |
| `IDLE`                 | Tạo/điều hướng tab nguồn → `LOADING_PAGE`                                                |
| `LOADING_PAGE`         | Content ready / tải xong → `SCANNING_TASKS`                                              |
| `SCANNING_TASKS`       | Có việc → `TASK_AVAILABLE`; hết việc đã xác minh → `PAGE_COMPLETED`                      |
| `TASK_AVAILABLE`       | Người dùng mở → `WAITING_USER_ACTION`; bỏ qua → `TASK_COMPLETED`                         |
| `WAITING_USER_ACTION`  | API mở/focus tab hoàn tất → `WAITING_CONFIRMATION`                                       |
| `WAITING_CONFIRMATION` | Người dùng xác nhận/bỏ qua → `TASK_COMPLETED`                                            |
| `TASK_COMPLETED`       | Còn việc → `TASK_AVAILABLE`; hết hàng đợi → `PAGE_COMPLETED`                             |
| `PAGE_COMPLETED`       | Xác nhận danh sách/thưởng nhóm, bỏ qua trang hoặc rỗng đã xác minh → `WAITING_NEXT_PAGE` |
| `WAITING_NEXT_PAGE`    | Đến deadline và vẫn running → `LOADING_PAGE` của trang kế tiếp                           |
| `ERROR`                | Người dùng Quét lại → `SCANNING_TASKS`, hoặc Stop rồi Start                              |
| Bất kỳ                 | Stop → `STOPPED`; lỗi → `ERROR` và hủy deadline                                          |

MutationObserver có thể cập nhật công việc trong lúc chờ người dùng. Danh sách đã phát hiện của lượt hiện tại là snapshot tích lũy: DOM xóa nút không tự đánh dấu hoàn thành và không làm mất tiến độ nhóm. Người dùng bỏ qua công việc không còn hợp lệ. Không tự chuyển trang chỉ vì đã xác nhận task cuối của trang thưởng lẻ.

### Timer và service worker

Không có `setInterval` trong background. Chờ chuyển trang dùng deadline bền vững, `setTimeout` khi worker còn sống và một alarm dự phòng ít nhất 30 giây. Khi worker tỉnh lại, deadline và trạng thái được đọc lại trước hành động. Popup dùng interval 1 giây chỉ để hiển thị countdown.

Khoảng chờ cấu hình tối thiểu 5 giây là **thời gian tối thiểu**, không cam kết chính xác 5 giây nếu worker bị tạm dừng hoặc máy ngủ. Alarm Chrome có thể trễ và bị giới hạn độ phân giải; xem [Chrome alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms) và [service worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle). Không gọi API giả tạo để giữ worker sống.

Khôi phục trạng thái dừng không tự Start. Tab nguồn mất sẽ báo lỗi. Thao tác mở task bị ngắt giữa chừng khôi phục về chờ xác nhận; khi người dùng mở lại, extension tìm tab cùng URL và opener tab nguồn trước khi tạo tab mới. Nếu tab Facebook đổi URL, tab đó giữ nguyên và thao tác mở tiếp theo có thể tạo tab đúng URL mới. Không có API xóa tab trong dự án.

### Quyền và dữ liệu

Chỉ yêu cầu `storage`, `alarms`, host `https://tuongtaccheo.com/*` và `https://*.facebook.com/*`. Các phương thức Tabs đang dùng không cần quyền `tabs` rộng: host permission liên quan cho phép đọc URL tab phù hợp. Content scripts khai báo tĩnh nên không cần `scripting` hay `activeTab`. Không yêu cầu quyền cookie, không đọc mật khẩu, không chứa token/tài khoản, không gửi dữ liệu tới máy chủ riêng. URL Facebook và tiến độ chỉ nằm trong storage cục bộ của extension.

Dấu hiệu đăng nhập gồm ô password hiển thị trên trang nguồn và URL login/checkpoint hoặc ô password trên Facebook. Đây là tín hiệu hỗ trợ, không phải chứng nhận phiên đăng nhập hoặc kết quả tương tác. Luôn kiểm tra giao diện website thật. Khi mất mạng, selector lỗi, timeout hoặc nút thưởng không rõ, extension dừng điều phối ở ERROR để người dùng xử lý; không retry vô hạn.

## Kiểm thử và giới hạn xác minh

```bash
npm run typecheck
npm test
npm run build
npm audit
```

Unit tests dùng Chrome API stub, fake timers và HTML fixture để kiểm tra state machine, thứ tự trang, nhận diện, dedupe, Start/Stop, deadline, worker restore, mapping tab, scan cũ, trang trống, thưởng lẻ/nhóm. Các stub chỉ nằm trong `tests/` và không được đóng gói trong `dist`.

Trước khi dùng trên tài khoản thật, thực hiện smoke test thủ công:

1. Load unpacked, kiểm tra không có lỗi manifest/background trong trang quản lý extension.
2. Xác minh adapter trên cả bốn trang đăng nhập thật; kiểm tra task và nút chức năng được phân biệt.
3. Mở công việc, đóng/mở popup, đóng tab Facebook và mở lại; kiểm tra không mất tiến độ.
4. Stop khi đang countdown; chờ hơn 30 giây, bảo đảm không chuyển trang/mở tab mới.
5. Thử đóng tab gốc, chuyển URL tab Facebook, mất mạng, đăng xuất, DOM không khớp.
6. Với VIP: chưa xong danh sách không nhận thưởng nhóm; xác nhận task cuối chưa tự chuyển; tự nhận xu rồi xác nhận riêng mới chuyển.
7. Dừng service worker qua DevTools rồi mở lại popup, kiểm tra deadline/tiến độ được khôi phục; nếu STOPPED vẫn phải dừng.

Build và unit test không thay thế kiểm chứng DOM đăng nhập thực. Dự án không tự thực hiện giao dịch thưởng hoặc tương tác xã hội trong quá trình kiểm thử.
