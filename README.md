# CrossEngage

Chrome Extension Manifest V3, React + TypeScript + Vite + Zustand. **Chọn các chức năng và Start để chạy tự động; Stop để hủy điều phối.** Popup không yêu cầu mở từng công việc, bấm “Tôi đã Like/Follow” hay xác nhận thưởng bằng tay.

## Cài đặt / cập nhật

Yêu cầu Node 24 và Chrome 120+.

```bash
nvm use
npm ci
npm test
npm run build
```

1. Mở `chrome://extensions/`, bật Developer mode.
2. Load unpacked → chọn thư mục **dist**.
3. Khi đã cài: bấm **Reload** extension rồi tải lại tab Tuongtaccheo và các tab Facebook thuộc workflow để cập nhật content scripts.
4. Đăng nhập các website trong cùng Chrome. Mở popup, chọn 1–4 chức năng, bấm **Start**.
5. Dòng **Cập nhật: HH:mm · DD/MM/YYYY** hiển thị thời gian build của bản đang cài, theo giờ Việt Nam. Không cần chạy server khi dùng extension.

`npm run dev` chỉ phục vụ phát triển popup, không phải cách chạy extension. Build đặt `version_name` là thời gian hiển thị và `version` dạng số theo [định dạng manifest Chrome](https://developer.chrome.com/docs/extensions/reference/manifest/version).

## Luồng tự động

1. Tạo hoặc dùng lại tab nguồn thuộc workflow trong **cửa sổ Chrome nơi bấm Start**.
2. Quét danh sách công việc thật, loại trùng theo trang + URL Facebook chuẩn hóa.
3. **Bấm chính nút công việc trên Tuongtaccheo**. Hàm `onclick` của website xử lý việc mở tab; extension không chỉ lấy URL rồi tự tạo tab Facebook thay thế.
4. Nhận tab Facebook khi URL đúng công việc, `openerTabId` đúng tab nguồn, cùng `windowId`, và trang tải xong.
5. Đọc nút Like/Follow trên DOM, chỉ bấm khi tìm được một nút phù hợp trong vùng nội dung của mục tiêu. Nếu đã có trạng thái đã thích/đang theo dõi thì không bấm lại để tránh hủy tương tác.
6. Chờ DOM hiển thị trạng thái đã thích/đang theo dõi. Chỉ ghi nhận tiến độ sau khi thấy dấu hiệu đó, không coi việc gửi click là thành công.
7. Với ba trang thưởng lẻ, bấm nút nhận thưởng trong container của đúng công việc và chờ thông báo thành công mới xuất hiện.
8. Với `subcheofbvip`, hoàn tất toàn bộ Follow trước, sau đó bấm **Nhận tất cả xu** một lần và chờ thông báo thành công. Không nhận thưởng từng việc trên trang này.
9. Tự sang công việc/trang tiếp theo theo thứ tự và lựa chọn đã lưu. Khoảng chuyển trang tối thiểu 5 giây.

Bốn module: `likepostvipcheo`, `likepostvipre`, `subcheo`, `subcheofbvip`, dưới `https://tuongtaccheo.com/kiemtien/`.

### Khi hết nhiệm vụ

Nhận diện thông báo hiển thị “Chưa có thêm nhiệm vụ”, hoặc selector hết việc đã cấu hình. Chờ **3 giây**, hoặc **5 giây nếu chỉ chọn một trang**, rồi bấm nút có nhãn “Tải lại danh sách”/“Tải lại”. Đợi tối đa 4 giây cho danh sách cập nhật trước khi xác nhận còn rỗng. Tối đa 3 lượt thử mỗi trang. Nếu vẫn rỗng thì sang trang tiếp theo đã chọn; nếu cả vòng rỗng thì Stop. Chỉ chọn một trang thì Stop sau 3 lần vẫn rỗng. Có công việc mới sẽ hủy lượt chờ tải lại.

### Phạm vi thao tác

- Extension chạy trong phiên/profile Chrome đã cài, không điều khiển ứng dụng khác hoặc profile Chrome khác.
- Mỗi workflow gắn với một cửa sổ Chrome. Tab Facebook có cùng URL nhưng không được mở từ tab nguồn hoặc khác cửa sổ sẽ không được nhận làm tab công việc.
- Trước mỗi click, content script kiểm tra operation token và Stop trong storage, rồi hỏi background xác minh lại tab, URL và cửa sổ thực tế.
- Đổi URL, chuyển tab workflow sang cửa sổ khác, đóng tab đang thực thi hoặc hết deadline sẽ tạm dừng với lỗi.
- Không đóng tab nào. Không focus cửa sổ khác, không quét để tái sử dụng tab Facebook người dùng đang làm việc riêng.
- Stop phát tín hiệu hủy đến content scripts, hủy observer chờ kết quả và deadline; không phát lại click. Lệnh đã gửi cho website trước thời điểm Stop không thể thu hồi.

## Nhận diện DOM và giới hạn xác minh

Đã có HTML nút Like thật chứa URL bọc dấu nháy trong `title` (`tests/fixtures/like-title.html`). Chưa kiểm thử trực tiếp toàn bộ DOM đăng nhập hiện tại của Facebook và nút nhận thưởng trên cả bốn trang. Các quy tắc dưới đây là adapter DOM có kiểm thử fixture; build thành công không chứng minh website thực tế luôn phù hợp.

- Công việc: `.btn.btn-default`, hiển thị, không disabled, không phải nút chức năng. Đọc `href`, `data-url`, `title` và thuộc tính URL đã cấu hình. URL mỗi nút được đọc riêng, không hardcode URL mẫu. Chỉ bấm phần tử tìm được từ đúng taskId. Không dùng `eval` hoặc gọi API Facebook trực tiếp.
- Facebook: tìm vùng bài viết có permalink đúng URL, hoặc một vùng bài viết duy nhất; fallback vùng `main` duy nhất. Nút có nhãn Việt/Anh chính xác: Thích/Like, Theo dõi/Follow. Kết quả dựa trên `aria-pressed=true`, Bỏ thích/Unlike hoặc Đang theo dõi/Following. Có nhiều nút hoặc không xác định được mục tiêu thì báo lỗi, không chọn nút đầu tiên tùy ý.
- Thưởng lẻ: dùng container/selector đã cấu hình; nếu chưa cấu hình, tìm từ cây tổ tiên của nút công việc vừa bấm, loại container chứa công việc khác, yêu cầu duy nhất nút nhãn Nhận xu/Nhận thưởng. Không lấy nút Nhận tất cả xu cho thưởng lẻ.
- Thưởng nhóm: duy nhất nút hiển thị có nội dung Nhận tất cả xu.
- Kết quả thưởng: thông báo hiển thị mới trong vùng alert/toast có nội dung nhận thành công/đã cộng xu, hoặc `rewardSuccessSelector` đã xác minh. Thông báo cũ không đủ để xác nhận lượt mới. Nếu website báo kết quả theo DOM khác, workflow báo timeout để sửa adapter.

Dấu hiệu DOM phản ánh giao diện, không phải chứng nhận độc lập từ máy chủ Facebook. Extension không vượt CAPTCHA, không xử lý checkpoint tự động và không truy cập API Facebook không được cấp quyền. Nếu site chặn popup do click không có user gesture hoặc mở bằng `noopener` làm mất quan hệ tab nguồn, workflow sẽ timeout thay vì tự nhận nhầm tab. Nội dung trang nguồn phải được tải lại sau khi reload extension.

### Adapter nâng cao

Dừng workflow trước khi sửa JSON trong **Cấu hình**. Các trường độc lập cho từng trang:

| Trường                     | Mục đích                                                     |
| -------------------------- | ------------------------------------------------------------ |
| `taskSelector`             | Ứng viên công việc, mặc định `.btn.btn-default`              |
| `containerSelector`        | Container chính xác của một công việc                        |
| `urlAttribute`             | Thuộc tính URL bổ sung                                       |
| `individualRewardSelector` | Nút thưởng lẻ bên trong container                            |
| `emptySelector`            | Thông báo danh sách rỗng                                     |
| `facebookScopeSelector`    | Vùng chứa duy nhất nút tương tác đúng mục tiêu trên Facebook |
| `rewardSuccessSelector`    | Thông báo chỉ xuất hiện khi nhận thưởng thành công           |

Selector chưa xác minh để trống. Không dùng selector quá rộng làm dấu hiệu thành công, ví dụ `body` hoặc container luôn hiển thị. Khi DOM không phù hợp, extension ghi rõ bước lỗi và không tự chuyển tiếp như thể đã thành công. Xử lý lỗi rồi Stop/Start lại.

## Kiến trúc

```text
src/background/automatic-workflow.ts  Điều phối tự động OPEN → FACEBOOK → REWARD
src/background/workflow-manager.ts   Queue, scan, Start/Stop, timer, storage, thứ tự trang
src/background/index.ts              Messaging và sự kiện tabs/alarms
src/background/state-machine.ts      Đồ thị trạng thái
src/content/source-automation.ts     Bấm nút gốc, thưởng lẻ/nhóm, chờ kết quả
src/content/facebook.ts              Nhận diện và thực hiện tương tác trên tab đã được giao
src/content/automatic-runtime.ts     Operation token, hủy khi Stop, MutationObserver bounded
src/content/automatic-dom.ts         Scope/nhãn nút và tín hiệu kết quả
src/content/tuongtaccheo.ts           Quét DOM và tải lại danh sách
src/modules/                         Bốn module công việc
src/popup/                           React UI, Zustand, chọn chức năng, Start/Stop, nhật ký
src/services/                        Storage và messaging
src/types/                           Task, State, operation, settings
```

Một hàng đợi Promise xử lý toàn bộ thay đổi trạng thái trong background. `operation` chứa ID, stage, taskId, tabId và deadline. Ý định được ghi storage trước khi gửi thao tác; khi worker bị tạm dừng, không tự gửi lại cùng click. Kết quả chỉ được chấp nhận từ đúng tab, URL, cửa sổ và operation ID. Có giới hạn 30 giây cho một bước; bộ chờ DOM thường tối đa 20 giây. Message lặp/cũ được bỏ qua.

Các tên trạng thái nội bộ `WAITING_USER_ACTION` và `WAITING_CONFIRMATION` được giữ cho tương thích storage, nhưng trong chế độ hiện tại chúng lần lượt là **đang bấm nút gốc/chờ tab** và **đang thực hiện/chờ kết quả DOM Facebook**. Không chờ người dùng bấm xác nhận. Các command xác nhận tay cũ không được runtime production tiếp nhận.

`verifiedTasks` ghi nhận tương tác có kết quả DOM; `rewardedTasks` chỉ ghi nhận khi có thông báo thưởng. Tiến độ xác nhận tay từ phiên bản cũ không được tự coi là bằng chứng cho thưởng nhóm. Khi nâng cấp lần đầu từ bản thủ công, workflow chuyển về STOPPED và chờ Start. Lịch sử vẫn được giữ; có thể xóa khi đã Stop.

Deadline dùng `setTimeout` và một alarm dự phòng tối thiểu 30 giây. Không có `setInterval` để giữ service worker sống. Nếu worker ngủ hoặc máy ngủ, bước chờ có thể lâu hơn số giây cấu hình. Xem [Chrome alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms). Khi popup đóng, workflow tiếp tục; khi Stop, khôi phục worker vẫn giữ stopped.

Quyền: `storage`, `alarms` và host Tuongtaccheo/Facebook. Content scripts khai báo tĩnh, không cần quyền scripting. Dữ liệu tiến độ lưu cục bộ; không đọc cookie/mật khẩu, không gửi dữ liệu tới server riêng, không chứa tài khoản hoặc token bí mật.

## Kiểm thử

```bash
npm run typecheck
npm test
npm run build
```

Tests gồm state machine, vòng trang, selector, dedupe, Start/Stop, retry, worker restore, trực tiếp click nút gốc, luồng tự động, claim nhóm, stale message, chống double click, đúng cửa sổ/opener/URL, kết quả DOM và hủy observer. Chrome API và HTML fixture chỉ được giả lập trong `tests/`, không có dữ liệu giả trong logic chạy chính. Các bài test không thực hiện tương tác hoặc nhận thưởng trên tài khoản thật.

Cần kiểm tra trên trang đăng nhập thật sau khi Reload extension để xác nhận các adapter phù hợp DOM hiện tại. Nếu không phù hợp, nhật ký và bước ERROR là thông tin dùng để điều chỉnh; không coi test fixture là kết quả end-to-end trên website.
