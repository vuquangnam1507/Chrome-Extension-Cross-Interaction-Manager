import { useEffect, useState } from 'react';
import { useWorkflow } from './store';
import type { Settings, Command } from '../types';

export default function App() {
  const { state: s, busy, error, execute } = useWorkflow();
  const [tab, setTab] = useState('work');
  const [draft, setDraft] = useState<Settings | null>(null);
  const [adapter, setAdapter] = useState('');
  const [localError, setLocalError] = useState('');
  useEffect(() => {
    void execute({ type: 'GET' });
  }, [execute]);
  useEffect(() => {
    if (s && !s.running) {
      setDraft(structuredClone(s.settings));
      setAdapter(JSON.stringify(s.settings.adapters, null, 2));
    }
  }, [s?.settings, s?.running]);
  if (!s) return <main>Đang kết nối CrossEngage…{error && <p>{error}</p>}</main>;
  const action = (type: Command['type']) => void execute({ type } as Command);
  const logLevel = (entry: (typeof s.activityLogs)[number]) =>
    entry.level ||
    (entry.text === s.error
      ? 'error'
      : /bỏ qua|chưa có.*nhiệm vụ|chưa có.*công việc/i.test(entry.text)
        ? 'warning'
        : 'info');
  const renderSteps = () => (
    <ol
      className="logs steps"
      role="log"
      aria-label="Các bước thực hiện"
      aria-live="polite"
      aria-relevant="additions"
    >
      {s.activityLogs.map((entry, index) => {
        const level = logLevel(entry);
        return (
          <li key={`${entry.time}-${index}`} className={`log-${level}`}>
            <div className="log-meta">
              <time>{new Date(entry.time).toLocaleTimeString('vi-VN')}</time>
              <span>
                {level === 'error' ? '✕ Lỗi' : level === 'warning' ? '⚠ Cảnh báo' : '• Thực hiện'}
              </span>
            </div>
            <div>{entry.text}</div>
          </li>
        );
      })}
    </ol>
  );
  const enabled = !s.running && draft ? draft.enabled : s.settings.enabled;
  const selectedPages = s.settings.order.filter((p) => enabled[p]);
  const titles = {
    likepostvipcheo: 'Like VIP chéo',
    likepostvipre: 'Like VIP rẻ',
    subcheo: 'Follow thường',
    subcheofbvip: 'Follow VIP · thưởng nhóm',
  };
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
          ['work', 'Các bước'],
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
        <section className="execution-steps">
          <h2>Các bước thực hiện</h2>
          <p className="note">Mới nhất ở trên.</p>
          {s.activityLogs.length ? (
            renderSteps()
          ) : (
            <p className="note">Chưa có bước thực hiện. Chọn chức năng và bấm Start.</p>
          )}
        </section>
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
          {renderSteps()}
        </section>
      )}
      <footer>TỰ ĐỘNG · CHỈ TAB THUỘC WORKFLOW</footer>
    </main>
  );
}
