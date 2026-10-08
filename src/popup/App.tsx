import { useEffect, useState } from 'react';
import { useWorkflow } from './store';
import type { Settings, Command } from '../types';
import { batchComplete, pending } from '../services/task.service';
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
  const disabled = busy || !s.running;
  const enabled = !s.running && draft ? draft.enabled : s.settings.enabled;
  const selectedPages = s.settings.order.filter((p) => enabled[p]);
  const titles = {
    likepostvipcheo: 'Like VIP chéo',
    likepostvipre: 'Like VIP rẻ',
    subcheo: 'Follow thường',
    subcheofbvip: 'Follow VIP · thưởng nhóm',
  };
  const completed = s.tasks.filter((t) => s.completedTasks.includes(t.id)).length;
  return (
    <main>
      <header>
        <div className="brand">
          C<span>↗</span>
        </div>
        <div>
          <h1>CrossEngage</h1>
          <small>Trợ lý điều phối công việc</small>
        </div>
        <span className={`status ${s.running ? 'on' : ''}`}>
          {s.running ? 'Running' : 'Stopped'}
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
          onClick={() => void execute({ type: 'START', enabled })}
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
            <small>{s.phase}</small>
            <div className="stats">
              <div>
                <strong>{s.tasks.length}</strong>Phát hiện
              </div>
              <div>
                <strong>
                  {completed} / {s.tasks.length}
                </strong>
                Đã xác nhận
              </div>
              <div>
                <strong>{s.dueAt ? Math.max(0, Math.ceil((s.dueAt - now) / 1000)) : '—'}</strong>
                Giây chờ
              </div>
            </div>
            <progress max={s.tasks.length || 1} value={completed} />
          </section>
          <section>
            <div className="eyebrow">
              {batch ? 'FOLLOW · NHẬN THƯỞNG THEO NHÓM' : task?.kind || 'HÀNG ĐỢI'}
            </div>
            {task && pending(s).some((t) => t.id === task.id) ? (
              <>
                <h2>{task.label}</h2>
                <p className="url">{task.url}</p>
                <button
                  className="primary full"
                  disabled={
                    disabled || !['TASK_AVAILABLE', 'WAITING_CONFIRMATION'].includes(s.phase)
                  }
                  onClick={() => action('OPEN')}
                >
                  Mở Facebook / Quay lại công việc ↗
                </button>
                <div className="controls">
                  <button
                    disabled={disabled || s.phase !== 'WAITING_CONFIRMATION'}
                    onClick={() => action('CONFIRM')}
                  >
                    Tôi đã {task.kind === 'LIKE' ? 'Like' : 'Follow'}
                  </button>
                  <button
                    disabled={
                      disabled || !['TASK_AVAILABLE', 'WAITING_CONFIRMATION'].includes(s.phase)
                    }
                    onClick={() => action('SKIP_TASK')}
                  >
                    Bỏ qua
                  </button>
                </div>
              </>
            ) : (
              <p>{s.tasks.length ? 'Danh sách đã xử lý.' : 'Chưa có công việc được nhận diện.'}</p>
            )}
            <p className="note">
              Bạn tự thao tác trên Facebook. Xác nhận chỉ ghi nhận tiến độ, không xác minh
              Like/Follow thành công.
            </p>
          </section>
          <section>
            <div className="controls">
              <button disabled={busy || s.originTabId === null} onClick={() => action('BACK')}>
                Về tab gốc
              </button>
              <button
                disabled={disabled || (batch && !batchComplete(s))}
                onClick={() => action('HIGHLIGHT')}
              >
                {batch ? 'Tìm “Nhận tất cả xu”' : 'Tìm thưởng công việc vừa xong'}
              </button>
            </div>
            {batch && (
              <button
                className="full"
                disabled={disabled || !batchComplete(s) || s.phase === 'WAITING_NEXT_PAGE'}
                onClick={() => action('REWARD_CONFIRMED')}
              >
                Tôi đã nhận thưởng nhóm → chuyển trang
              </button>
            )}
            <div className="controls">
              <button
                disabled={disabled || s.phase === 'WAITING_NEXT_PAGE'}
                onClick={() => action('RESCAN')}
              >
                Quét lại
              </button>
              <button
                disabled={disabled || s.phase === 'WAITING_NEXT_PAGE' || s.phase === 'LOADING_PAGE'}
                onClick={() => action('SKIP_PAGE')}
              >
                Bỏ qua trang
              </button>
            </div>
            {!batch && (
              <button
                className="full"
                disabled={disabled || pending(s).length > 0 || s.phase !== 'PAGE_COMPLETED'}
                onClick={() => action('FINISH_PAGE')}
              >
                Đã xử lý danh sách → chuyển trang
              </button>
            )}
            <small>Nhận thưởng luôn do bạn tự nhấn trên trang gốc.</small>
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
            {s.completedTasks.length} xác nhận · {s.skippedTasks.length} bỏ qua (lịch sử)
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
      <footer>THỦ CÔNG · MINH BẠCH · KHÔNG TỰ NHẬN XU</footer>
    </main>
  );
}
