import { useEffect, useState } from 'react';
import { useWorkflow } from './store';
import type { Settings, Command, Phase } from '../types';

export default function App() {
  const { state: s, busy, error, execute } = useWorkflow();
  const [tab, setTab] = useState('work');
  const [draft, setDraft] = useState<Settings | null>(null);
  const [now, setNow] = useState(Date.now());
  const [adapter, setAdapter] = useState('');
  const [localError, setLocalError] = useState('');
  useEffect(() => {
    void execute({ type: 'GET' });
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [execute]);
  useEffect(() => {
    if (s && !s.running) {
      setDraft(structuredClone(s.settings));
      setAdapter(JSON.stringify(s.settings.adapters, null, 2));
    }
  }, [s?.settings, s?.running]);
  if (!s) return <main>Đang kết nối CrossEngage…{error && <p>{error}</p>}</main>;
  const page = s.settings.order[s.currentPageIndex];
  const task = s.tasks.find((t) => t.id === s.currentTaskId);
  const batch = page === 'subcheofbvip';
  const action = (type: Command['type']) => void execute({ type } as Command);
  const phaseLabels: Record<Phase, string> = {
    STOPPED: 'Đã dừng',
    IDLE: 'Chuẩn bị',
    LOADING_PAGE: 'Đang tải trang',
    SCANNING_TASKS: 'Đang tìm nhiệm vụ',
    TASK_AVAILABLE: 'Đã phát hiện nhiệm vụ',
    WAITING_USER_ACTION: 'Đang mở công việc tự động',
    WAITING_CONFIRMATION: 'Đang thực hiện trên Facebook',
    TASK_COMPLETED: 'Đang xử lý nhận thưởng',
    PAGE_COMPLETED: 'Hoàn tất danh sách',
    WAITING_NEXT_PAGE: 'Đang chờ chuyển trang',
    ERROR: 'Đã tạm dừng do lỗi',
  };
  const operationLabels = {
    OPEN_TASK: 'Bấm nút gốc → chờ Facebook mở',
    FACEBOOK_ACTION: 'Thực hiện tương tác → kiểm tra kết quả',
    CLAIM_REWARD: 'Nhận xu → kiểm tra thông báo',
    CLAIM_BATCH: 'Nhận tất cả xu → kiểm tra thông báo',
  };
  const enabled = !s.running && draft ? draft.enabled : s.settings.enabled;
  const selectedPages = s.settings.order.filter((p) => enabled[p]);
  const titles = {
    likepostvipcheo: 'Like VIP chéo',
    likepostvipre: 'Like VIP rẻ',
    subcheo: 'Follow thường',
    subcheofbvip: 'Follow VIP · thưởng nhóm',
  };
  const countdown = s.emptyRetryAt ?? s.dueAt;
  const completed = s.tasks.filter((t) => s.verifiedTasks.includes(t.id)).length;
  return (
    <main>
      <header>
        <div className="brand">
          C<span>↗</span>
        </div>
        <div>
          <h1>CrossEngage</h1>
          <small>Trợ lý điều phối công việc</small>
          <div className="build-time" title="Thời gian build của bản đang cài, theo giờ Việt Nam">
            Cập nhật: {chrome.runtime.getManifest().version_name || 'Bản phát triển'}
          </div>
        </div>
        <span className={`status ${s.running ? 'on' : ''}`}>
          {s.phase === 'ERROR' ? 'Tạm dừng' : s.running ? 'Running' : 'Stopped'}
        </span>
      </header>
      <section className="run-selection" aria-labelledby="run-selection-title">
        <div className="selection-heading">
          <h2 id="run-selection-title">Chọn chức năng chạy</h2>
          <span>{selectedPages.length} / 4 đã chọn</span>
        </div>
        <fieldset disabled={busy || s.running || !draft}>
          <div className="selection-grid">
            {s.settings.order.map((p) => (
              <label key={p} className={`selection-card ${enabled[p] ? 'checked' : ''}`}>
                <input
                  type="checkbox"
                  checked={enabled[p]}
                  onChange={(e) => {
                    if (draft)
                      setDraft({ ...draft, enabled: { ...draft.enabled, [p]: e.target.checked } });
                  }}
                />
                <span>
                  <strong>{titles[p]}</strong>
                  <small>{p}</small>
                </span>
              </label>
            ))}
          </div>
          <div className="selection-shortcuts">
            <button
              onClick={() => {
                if (draft)
                  setDraft({
                    ...draft,
                    enabled: {
                      likepostvipcheo: true,
                      likepostvipre: true,
                      subcheo: true,
                      subcheofbvip: true,
                    },
                  });
              }}
            >
              Chọn tất cả
            </button>
            <button
              onClick={() => {
                if (draft)
                  setDraft({
                    ...draft,
                    enabled: {
                      likepostvipcheo: false,
                      likepostvipre: false,
                      subcheo: false,
                      subcheofbvip: false,
                    },
                  });
              }}
            >
              Bỏ chọn tất cả
            </button>
          </div>
        </fieldset>
        <p className="note" aria-live="polite">
          {s.running
            ? 'Đang chạy các mục đã chọn. Bấm Stop để đổi lựa chọn.'
            : selectedPages.length
              ? 'Chọn 1–4 chức năng để kiểm tra. Lựa chọn được lưu khi bấm Start.'
              : 'Chọn ít nhất một chức năng để bắt đầu.'}
        </p>
        {selectedPages.length > 0 && (
          <p className="selection-order">
            Thứ tự: {selectedPages.map((p) => titles[p]).join(' → ')}
          </p>
        )}
      </section>
      <div className="controls">
        <button
          className="primary"
          disabled={busy || s.running || !draft || selectedPages.length === 0}
          onClick={() => {
            void chrome.windows
              .getCurrent()
              .then((window) => {
                if (window.id === undefined)
                  throw Error('Không xác định được cửa sổ Chrome hiện tại.');
                return execute({ type: 'START', enabled, windowId: window.id });
              })
              .catch((e) => setLocalError(String(e)));
          }}
        >
          ▶ Start ({selectedPages.length}/4)
        </button>
        <button disabled={!s.running} onClick={() => action('STOP')}>
          ■ Stop
        </button>
      </div>
      <nav>
        {[
          ['work', 'Công việc'],
          ['settings', 'Cấu hình'],
          ['logs', 'Nhật ký'],
        ].map(([id, label]) => (
          <button key={id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>
      {(error || s.error || localError) && (
        <div className="error" role="alert">
          {error || s.error || localError}
        </div>
      )}
      {tab === 'work' && (
        <>
          <section>
            <div className="eyebrow">TRANG ĐANG XỬ LÝ</div>
            <h2>{page}</h2>
            <small>{phaseLabels[s.phase]}</small>
            <div className="stats">
              <div>
                <strong>{s.tasks.length}</strong>Phát hiện
              </div>
              <div>
                <strong>
                  {completed} / {s.tasks.length}
                </strong>
                Đã có kết quả
              </div>
              <div>
                <strong>
                  {countdown ? Math.max(0, Math.ceil((countdown - now) / 1000)) : '—'}
                </strong>
                {s.emptyRetryAt ? `Tải lại lần ${s.emptyRetryCount + 1}` : 'Giây chờ'}
              </div>
            </div>
            <progress max={s.tasks.length || 1} value={completed} />
          </section>
          <section>
            <div className="eyebrow">
              TỰ ĐỘNG · {batch ? 'THƯỞNG THEO NHÓM' : 'THƯỞNG TỪNG CÔNG VIỆC'}
            </div>
            <h2>{s.operation ? operationLabels[s.operation.stage] : phaseLabels[s.phase]}</h2>
            {task && <p className="url">{task.url}</p>}
            <p className="note">Start để chạy toàn bộ quy trình. Stop để hủy các bước đang chờ.</p>
            <small>
              Đã nhận thưởng: {s.tasks.filter((t) => s.rewardedTasks.includes(t.id)).length} /{' '}
              {s.tasks.length} · Chỉ thao tác trên tab thuộc workflow trong cửa sổ Chrome này.
            </small>
          </section>
        </>
      )}
      {tab === 'settings' && draft && (
        <section>
          <h2>Cấu hình quy trình</h2>
          <p className="note">
            Dừng quy trình trước khi sửa. Trang không nhận diện được sẽ chờ bạn kiểm tra.
          </p>
          <fieldset disabled={busy || s.running}>
            <label>
              Khoảng chuyển trang (giây)
              <input
                type="number"
                min="5"
                max="3600"
                value={draft.delaySeconds}
                onChange={(e) => setDraft({ ...draft, delaySeconds: Number(e.target.value) })}
              />
            </label>
            {draft.order.map((p, i) => (
              <div className="page-row" key={p}>
                <label>
                  <input
                    type="checkbox"
                    checked={draft.enabled[p]}
                    onChange={(e) =>
                      setDraft({ ...draft, enabled: { ...draft.enabled, [p]: e.target.checked } })
                    }
                  />
                  {p}
                </label>
                <button
                  disabled={i === 0}
                  onClick={() => {
                    const order = [...draft.order];
                    [order[i - 1], order[i]] = [order[i], order[i - 1]];
                    setDraft({ ...draft, order });
                  }}
                >
                  ↑
                </button>
                <button
                  disabled={i === 3}
                  onClick={() => {
                    const order = [...draft.order];
                    [order[i + 1], order[i]] = [order[i], order[i + 1]];
                    setDraft({ ...draft, order });
                  }}
                >
                  ↓
                </button>
              </div>
            ))}
            <details>
              <summary>Adapter DOM nâng cao (JSON)</summary>
              <p className="note">
                Selector thưởng lẻ, container và dấu hiệu hết việc để trống cho đến khi xác minh
                HTML thực tế.
              </p>
              <textarea rows={14} value={adapter} onChange={(e) => setAdapter(e.target.value)} />
            </details>
            <button
              className="primary full"
              onClick={() => {
                try {
                  const adapters = JSON.parse(adapter);
                  for (const c of Object.values(
                    adapters,
                  ) as Settings['adapters'][keyof Settings['adapters']][]) {
                    for (const key of [
                      'taskSelector',
                      'containerSelector',
                      'individualRewardSelector',
                      'emptySelector',
                      'facebookScopeSelector',
                      'rewardSuccessSelector',
                    ] as const)
                      if (c[key]) document.querySelector(c[key]);
                  }
                  setLocalError('');
                  void execute({ type: 'SETTINGS', settings: { ...draft, adapters } });
                } catch (e) {
                  setLocalError(`Cấu hình không hợp lệ: ${e}`);
                }
              }}
            >
              Lưu cấu hình
            </button>
          </fieldset>
        </section>
      )}
      {tab === 'logs' && (
        <section>
          <h2>Nhật ký hoạt động</h2>
          <p>
            {s.verifiedTasks.length} đã có kết quả · {s.skippedTasks.length} bỏ qua (lịch sử)
          </p>
          <button
            disabled={busy || s.running}
            onClick={() => {
              if (window.confirm('Xóa toàn bộ lịch sử và tiến độ? Các tab được giữ nguyên.'))
                action('CLEAR');
            }}
          >
            Xóa lịch sử xử lý
          </button>
          <ol className="logs">
            {s.activityLogs.map((l, i) => (
              <li key={`${l.time}-${i}`}>
                <time>{new Date(l.time).toLocaleTimeString('vi-VN')}</time>
                {l.text}
              </li>
            ))}
          </ol>
        </section>
      )}
      <footer>TỰ ĐỘNG · CHỈ TAB THUỘC WORKFLOW</footer>
    </main>
  );
}
