import React, { useState, useEffect } from 'react';

export default function App() {
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [dbStatus, setDbStatus] = useState(null);
  const [monitor, setMonitor] = useState(null);
  const [securityStats, setSecurityStats] = useState(null);
  const [backups, setBackups] = useState([]);
  const [deployHistory, setDeployHistory] = useState([]);
  
  const [activeTab, setActiveTab] = useState('cache');
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // States cho tính năng Cache
  const [benchmarkResult, setBenchmarkResult] = useState(null);
  const [cacheKeys, setCacheKeys] = useState([]);

  // States cho tính năng Database EXPLAIN
  const [explainResult, setExplainResult] = useState(null);
  const [testEmail, setTestEmail] = useState('user_100@gmail.com');
  const [explainLoading, setExplainLoading] = useState(false);

  // Tự động fetch dữ liệu metrics định kỳ
  const fetchAllMetrics = async () => {
    try {
      const [rStats, rHealth, rDb, rMon, rSec, rBackups, rDeploys] = await Promise.all([
        fetch('/api/cache/stats').then(r => r.json()).catch(() => null),
        fetch('/api/system/health').then(r => r.json()).catch(() => null),
        fetch('/api/db/status').then(r => r.json()).catch(() => null),
        fetch('/api/monitor/status').then(r => r.json()).catch(() => null),
        fetch('/api/security/stats').then(r => r.json()).catch(() => null),
        fetch('/api/backups').then(r => r.json()).catch(() => null),
        fetch('/api/webhook/history').then(r => r.json()).catch(() => null)
      ]);

      if (rStats?.success) setStats(rStats);
      if (rHealth?.status) setHealth(rHealth);
      if (rDb?.success) setDbStatus(rDb);
      if (rMon?.success) setMonitor(rMon);
      if (rSec?.success) setSecurityStats(rSec);
      if (rBackups?.success) setBackups(rBackups.files || []);
      if (rDeploys?.success) setDeployHistory(rDeploys.history || []);
    } catch (err) {
      console.error('Fetch error:', err);
    }
  };

  useEffect(() => {
    fetchAllMetrics();
    const interval = setInterval(fetchAllMetrics, 4000);
    return () => clearInterval(interval);
  }, []);

  const showToast = (msg, type = 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // --- ACTIONS ---
  // 1. Chạy Cache Benchmark
  const runCacheBenchmark = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cache/benchmark?type=analytics&refresh=${forceRefresh}`);
      const data = await res.json();
      setBenchmarkResult(data);
      fetchAllMetrics();
      showToast(
        data.isCached ? `⚡ Cache HIT (${data.source}) trong ${data.latencyMs}ms!` : `🐢 Cache MISS trong ${data.totalTimeMs}ms!`,
        data.isCached ? 'success' : 'warn'
      );
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'danger');
    } finally {
      setLoading(false);
    }
  };

  // 2. Chạy EXPLAIN Benchmark
  const runExplainBenchmark = async () => {
    setExplainLoading(true);
    try {
      const res = await fetch(`/api/db/explain?email=${encodeURIComponent(testEmail)}`);
      const data = await res.json();
      if (data.success) {
        setExplainResult(data);
        showToast(`✔ Giải trình EXPLAIN hoàn tất: Tốc độ tăng ${data.speedup}!`, 'success');
      } else {
        showToast('Lỗi EXPLAIN: ' + data.error, 'danger');
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'danger');
    } finally {
      setExplainLoading(false);
    }
  };

  // 3. Xóa Cache
  const handlePurgeAll = async () => {
    try {
      const res = await fetch('/api/cache/purge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'all' })
      });
      const data = await res.json();
      showToast(data.message, 'success');
      setBenchmarkResult(null);
      fetchAllMetrics();
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'danger');
    }
  };

  // 4. Chạy Backup thủ công
  const handleRunBackup = async () => {
    showToast('Đang tiến hành xuất CSDL, nén Gzip và mã hóa AES-256...', 'warn');
    try {
      const res = await fetch('/api/backups/run', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('✔ Sao lưu và mã hóa CSDL thành công!', 'success');
        fetchAllMetrics();
      } else {
        showToast('Lỗi sao lưu: ' + data.message, 'danger');
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'danger');
    }
  };

  // 5. Test Gửi Cảnh Báo
  const handleTestAlert = async () => {
    try {
      const res = await fetch('/api/monitor/test-alert', { method: 'POST' });
      const data = await res.json();
      showToast(data.message, data.sent ? 'success' : 'warn');
    } catch (err) {
      showToast('Lỗi gửi cảnh báo: ' + err.message, 'danger');
    }
  };

  // 6. Test Deploy CI/CD
  const handleTriggerDeploy = async () => {
    showToast('Đang kích hoạt quy trình CI/CD: Backup -> Pull -> Build -> Reload PM2...', 'warn');
    try {
      const res = await fetch('/api/deploy/trigger', { method: 'POST' });
      const data = await res.json();
      showToast(data.message, 'success');
      fetchAllMetrics();
    } catch (err) {
      showToast('Lỗi trigger deploy: ' + err.message, 'danger');
    }
  };

  return (
    <div className="container">
      {/* Toast Notification */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          background: notification.type === 'danger' ? '#f43f5e' : notification.type === 'warn' ? '#f59e0b' : '#10b981',
          color: '#fff',
          padding: '0.85rem 1.35rem',
          borderRadius: '12px',
          fontWeight: 600,
          boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <span>{notification.type === 'success' ? '✓' : 'ℹ'}</span>
          <span>{notification.msg}</span>
        </div>
      )}

      {/* HEADER */}
      <header className="app-header">
        <div className="brand-wrapper">
          <div className="logo-icon">🛡️</div>
          <div>
            <h1 className="brand-title">CloudPanel DevOps &amp; React Enterprise</h1>
            <p className="brand-subtitle">Multi-Tier Caching &bull; MariaDB Indexing &bull; Security &bull; CI/CD &bull; Auto-Backup</p>
          </div>
        </div>

        <div className="header-badges">
          <div className="pill">
            <span className="pill-dot live"></span>
            <span>Domain: phuoc-nodejs.sixforce.io.vn</span>
          </div>
          <div className="pill">
            <span className={`pill-dot ${dbStatus?.primaryDb?.connected ? 'live' : 'warn'}`}></span>
            <span>MariaDB: {dbStatus?.primaryDb?.connected ? '127.0.0.1:3306 (Phuoc-NodeJS)' : 'Connecting...'}</span>
          </div>
          <div className="pill">
            <span className={`pill-dot ${stats?.l2?.available ? 'live' : 'warn'}`}></span>
            <span>Redis L2: {stats?.l2?.available ? '127.0.0.1:6379' : 'Offline'}</span>
          </div>
          <div className="pill">
            <span className="pill-dot blue"></span>
            <span>PM2: PID {health?.pm2?.instanceId ?? '0'} (Cluster Mode)</span>
          </div>
        </div>
      </header>

      {/* TOP METRICS SUMMARY */}
      <section className="grid-4">
        {/* Metric 1: MariaDB Primary DB */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">🗄️ Primary DB (MariaDB)</span>
            <span className="badge badge-success">Port 3306</span>
          </div>
          <div className="stat-value">10,000+</div>
          <div className="stat-desc">
            Bảng <code>access_logs</code> | InnoDB Dynamic | Cột Index: <code>email</code>
          </div>
        </div>

        {/* Metric 2: Redis Secondary DB & Cache */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">⚡ Secondary DB (Redis)</span>
            <span className="badge badge-l2">Port 6379</span>
          </div>
          <div className="stat-value">{stats?.l2?.keysCount ?? 0} <span style={{ fontSize: '1rem', color: 'var(--text-dim)' }}>keys</span></div>
          <div className="stat-desc">
            RAM: <b>{stats?.l2?.memoryUsed || '0 KB'}</b> | Tỷ lệ Hit: <b>{stats?.stats?.hitRate || '0%'}</b>
          </div>
        </div>

        {/* Metric 3: Security & DDoS Shield */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">🛡️ Rate Limiting &amp; Firewall</span>
            <span className="badge badge-l1">UFW + Redis</span>
          </div>
          <div className="stat-value">{securityStats?.totalBlocked ?? 0} <span style={{ fontSize: '1rem', color: 'var(--text-dim)' }}>blocked</span></div>
          <div className="stat-desc">
            Tường lửa: <b>Chỉ mở 22, 80, 443, 8443</b> | Chống DDoS
          </div>
        </div>

        {/* Metric 4: VPS Health & Monitoring */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">🖥️ Sức Khỏe VPS</span>
            <span className={`badge ${monitor?.siteOnline ? 'badge-success' : 'badge-miss'}`}>
              {monitor?.siteOnline ? 'Web Online' : 'Down'}
            </span>
          </div>
          <div className="stat-value">{monitor?.cpuUsage ?? 0}% <span style={{ fontSize: '1rem', color: 'var(--text-dim)' }}>CPU</span></div>
          <div className="stat-desc">
            RAM: <b>{monitor?.ramUsagePercent ?? 0}%</b> ({monitor?.ramFreeMb ?? 0}MB trống) | Alert &gt; 85%
          </div>
        </div>
      </section>

      {/* MAIN NAVIGATION TABS */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem', flexWrap: 'wrap' }}>
        <button 
          onClick={() => setActiveTab('cache')} 
          className={`btn ${activeTab === 'cache' ? 'btn-primary' : 'btn-secondary'}`}
        >
          ⚡ Multi-Tier Cache
        </button>
        <button 
          onClick={() => setActiveTab('database')} 
          className={`btn ${activeTab === 'database' ? 'btn-primary' : 'btn-secondary'}`}
        >
          🔍 DB &amp; Giải Trình EXPLAIN Index
        </button>
        <button 
          onClick={() => setActiveTab('security')} 
          className={`btn ${activeTab === 'security' ? 'btn-primary' : 'btn-secondary'}`}
        >
          🔒 Tường Lửa UFW &amp; Bảo Mật SSL
        </button>
        <button 
          onClick={() => setActiveTab('cicd')} 
          className={`btn ${activeTab === 'cicd' ? 'btn-primary' : 'btn-secondary'}`}
        >
          🚀 GitHub Webhook &amp; Auto-Rollback
        </button>
        <button 
          onClick={() => setActiveTab('backup')} 
          className={`btn ${activeTab === 'backup' ? 'btn-primary' : 'btn-secondary'}`}
        >
          📦 Backup AES-256 &amp; Giám Sát Alert
        </button>
      </div>

      {/* TAB 1: CACHE ENGINE */}
      {activeTab === 'cache' && (
        <section className="grid-2">
          <div className="card">
            <h2 className="card-title">🧪 Thử nghiệm Cache Đa Tầng (L1 Memory + L2 Redis)</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              Dữ liệu được đệm tại L1 (RAM Worker &lt; 0.5ms) và L2 (Redis Local 6379 &lt; 2ms), giúp giảm tải 99% cho database.
            </p>

            <div className="button-group">
              <button onClick={() => runCacheBenchmark(false)} disabled={loading} className="btn btn-primary">
                {loading ? 'Đang truy vấn...' : '⚡ Truy vấn Dữ liệu (Dùng Cache)'}
              </button>
              <button onClick={() => runCacheBenchmark(true)} disabled={loading} className="btn btn-secondary">
                🔄 Ép làm mới (Bỏ qua Cache)
              </button>
              <button onClick={handlePurgeAll} className="btn btn-danger">
                🧹 Xóa sạch Cache
              </button>
            </div>

            <div className="speed-bar-container">
              <div className="speed-row">
                <div className="speed-meta">
                  <span style={{ color: '#a5b4fc', fontWeight: 600 }}>L1: In-Memory LRU (RAM)</span>
                  <span style={{ color: '#a5b4fc' }}>&lt; 0.5 ms (~100x nhanh hơn)</span>
                </div>
                <div className="speed-bar-track"><div className="speed-bar-fill fill-emerald" style={{ width: '4%' }}></div></div>
              </div>
              <div className="speed-row">
                <div className="speed-meta">
                  <span style={{ color: '#67e8f9', fontWeight: 600 }}>L2: Local Redis (:6379)</span>
                  <span style={{ color: '#67e8f9' }}>~1.3 ms (~50x nhanh hơn)</span>
                </div>
                <div className="speed-bar-track"><div className="speed-bar-fill fill-cyan" style={{ width: '8%' }}></div></div>
              </div>
              <div className="speed-row">
                <div className="speed-meta">
                  <span style={{ color: '#fbbf24', fontWeight: 600 }}>Chưa Cache (DB / Compute)</span>
                  <span style={{ color: '#fbbf24' }}>~200 - 350 ms</span>
                </div>
                <div className="speed-bar-track"><div className="speed-bar-fill fill-amber" style={{ width: '92%' }}></div></div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">📊 Kết quả phản hồi</h2>
              {benchmarkResult && (
                <span className={`badge ${benchmarkResult.source === 'L1-MEMORY' ? 'badge-l1' : benchmarkResult.source === 'L2-REDIS' ? 'badge-l2' : 'badge-miss'}`}>
                  {benchmarkResult.source}
                </span>
              )}
            </div>

            {benchmarkResult ? (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div className="playground-box" style={{ margin: 0, padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>ĐỘ TRỄ</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: benchmarkResult.isCached ? '#34d399' : '#f59e0b' }}>
                      {benchmarkResult.latencyMs} ms
                    </div>
                  </div>
                  <div className="playground-box" style={{ margin: 0, padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>NGUỒN</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#38bdf8' }}>{benchmarkResult.source}</div>
                  </div>
                  <div className="playground-box" style={{ margin: 0, padding: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>TRẠNG THÁI</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700, color: benchmarkResult.isCached ? '#10b981' : '#f43f5e' }}>
                      {benchmarkResult.isCached ? 'HIT' : 'MISS'}
                    </div>
                  </div>
                </div>
                <div className="code-box"><pre>{JSON.stringify(benchmarkResult.data, null, 2)}</pre></div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                Bấm nút <b>"Truy vấn Dữ liệu (Dùng Cache)"</b> để bắt đầu thử nghiệm.
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 2: DATABASE & EXPLAIN ANALYZE */}
      {activeTab === 'database' && (
        <section>
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 className="card-title">🔍 Công cụ Giải Trình Truy Vấn (EXPLAIN Plan Benchmark)</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '0.5rem 0 1rem' }}>
              Kiểm chứng tốc độ truy vấn vượt trội và số dòng phải quét trên bảng <b>access_logs (10,000+ bản ghi)</b> giữa việc Có Index (<code>idx_email</code>) và Không Index (<code>Full Table Scan</code>).
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input 
                type="text" 
                value={testEmail} 
                onChange={(e) => setTestEmail(e.target.value)} 
                placeholder="Nhập email cần tìm kiếm..."
                style={{
                  padding: '0.65rem 1rem',
                  borderRadius: '10px',
                  background: '#030712',
                  border: '1px solid var(--border-color)',
                  color: '#fff',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.875rem',
                  minWidth: '280px'
                }}
              />
              <button 
                onClick={runExplainBenchmark} 
                disabled={explainLoading}
                className="btn btn-primary"
              >
                {explainLoading ? 'Đang phân tích EXPLAIN...' : '⚡ Chạy Giải Trình EXPLAIN Đối Chiếu'}
              </button>
            </div>
          </div>

          {explainResult && (
            <div className="grid-2">
              {/* Box 1: CÓ INDEX */}
              <div className="card" style={{ borderColor: 'rgba(16, 185, 129, 0.4)' }}>
                <div className="card-header">
                  <span className="card-title" style={{ color: '#34d399' }}>✔ CÓ DÙNG CHỈ MỤC (INDEX)</span>
                  <span className="badge badge-success">Index Lookup</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div className="playground-box">
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>THỜI GIAN THỰC THI</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34d399' }}>{explainResult.withIndex.timeMs} ms</div>
                  </div>
                  <div className="playground-box">
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>SỐ DÒNG PHẢI QUÉT</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#38bdf8' }}>{explainResult.withIndex.rowsExamined} dòng</div>
                  </div>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Index được dùng: <code style={{ color: '#38bdf8' }}>{explainResult.withIndex.keyUsed}</code> &bull; Kiểu quét: <code>{explainResult.withIndex.scanType}</code>
                </div>
                <div className="code-box">
                  <pre>{JSON.stringify(explainResult.withIndex.explainPlan, null, 2)}</pre>
                </div>
              </div>

              {/* Box 2: KHÔNG CÓ INDEX */}
              <div className="card" style={{ borderColor: 'rgba(244, 63, 94, 0.4)' }}>
                <div className="card-header">
                  <span className="card-title" style={{ color: '#f43f5e' }}>✖ KHÔNG DÙNG INDEX (IGNORE INDEX)</span>
                  <span className="badge badge-miss">Full Table Scan</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div className="playground-box">
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>THỜI GIAN THỰC THI</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#f43f5e' }}>{explainResult.withoutIndex.timeMs} ms</div>
                  </div>
                  <div className="playground-box">
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>SỐ DÒNG PHẢI QUÉT</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fbbf24' }}>{explainResult.withoutIndex.rowsExamined} dòng (100% BẢNG)</div>
                  </div>
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                  Index: <code style={{ color: '#f43f5e' }}>None (FULL SCAN)</code> &bull; Kiểu quét: <code>ALL</code>
                </div>
                <div className="code-box">
                  <pre>{JSON.stringify(explainResult.withoutIndex.explainPlan, null, 2)}</pre>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 3: SECURITY, UFW & SSL */}
      {activeTab === 'security' && (
        <section className="grid-2">
          <div className="card">
            <h2 className="card-title">🛡️ Tường Lửa UFW &amp; Chống Tấn Công</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '0.5rem 0 1rem' }}>
              Chỉ mở các cổng cần thiết trên VPS và chặn toàn bộ các cổng DB (3306, 6379, 3000) đối với bên ngoài:
            </p>

            <table className="data-table" style={{ marginBottom: '1rem' }}>
              <thead>
                <tr>
                  <th>Cổng</th>
                  <th>Dịch vụ</th>
                  <th>Trạng thái Tường Lửa</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><code>22</code></td>
                  <td>SSH Terminal</td>
                  <td><span className="badge badge-success">ALLOWED</span></td>
                </tr>
                <tr>
                  <td><code>80 / 443</code></td>
                  <td>HTTP &amp; HTTPS (CloudPanel Nginx)</td>
                  <td><span className="badge badge-success">ALLOWED</span></td>
                </tr>
                <tr>
                  <td><code>8443</code></td>
                  <td>CloudPanel Control Panel</td>
                  <td><span className="badge badge-success">ALLOWED</span></td>
                </tr>
                <tr>
                  <td><code>3306 &amp; 6379</code></td>
                  <td>MariaDB &amp; Redis</td>
                  <td><span className="badge badge-miss">BLOCKED TO INTERNET</span></td>
                </tr>
              </tbody>
            </table>

            <div className="bash-snippet">
              <pre>{`# Kích hoạt nhanh Tường lửa UFW (chạy với sudo):
sudo bash scripts/setup-ufw.sh`}</pre>
            </div>
          </div>

          <div className="card">
            <h2 className="card-title">🔐 Cấu hình SSL &amp; Modern Cipher Suites</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '0.5rem 0 1rem' }}>
              Cấu hình bảo mật cao nhất đã sẵn sàng tại <code>scripts/nginx-ssl-hardening.conf</code>:
            </p>

            <ul style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.8', paddingLeft: '1.25rem', marginBottom: '1rem' }}>
              <li><b>Giao thức cao nhất</b>: Chỉ cho phép <code>TLSv1.2 TLSv1.3</code> (Vô hiệu hóa TLS 1.0 &amp; 1.1 lỗi thời).</li>
              <li><b>HSTS Preload</b>: <code>Strict-Transport-Security: max-age=31536000; includeSubDomains; preload</code></li>
              <li><b>Cipher Suites hiện đại</b>: ECDHE-ECDSA-AES128-GCM-SHA256, ChaCha20-Poly1305.</li>
              <li><b>Bảo vệ DDoS Nginx</b>: <code>limit_req zone=cp_req_limit burst=40 nodelay</code>.</li>
            </ul>

            <div className="bash-snippet">
              <pre>{`# Xem file cấu hình mẫu áp dụng vào Vhost Editor:
cat scripts/nginx-ssl-hardening.conf`}</pre>
            </div>
          </div>
        </section>
      )}

      {/* TAB 4: CI/CD & GITHUB WEBHOOK */}
      {activeTab === 'cicd' && (
        <section className="grid-2">
          <div className="card">
            <h2 className="card-title">🚀 GitHub Webhook Tự Động Triển Khai (CI/CD)</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '0.5rem 0 1rem' }}>
              Mỗi khi có code mới đẩy lên GitHub (push event), Webhook sẽ gửi tín hiệu tới VPS để tự động cập nhật:
            </p>

            <div className="bash-snippet" style={{ marginBottom: '1rem' }}>
              <pre>{`Payload URL: https://phuoc-nodejs.sixforce.io.vn/api/webhook/github
Content type: application/json
Secret: ****** (Lưu trong file .env)`}</pre>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button onClick={handleTriggerDeploy} className="btn btn-primary">
                🔨 Thử nghiệm Kích Hoạt Deploy &amp; Auto-Rollback
              </button>
            </div>

            <div style={{ marginTop: '1rem', fontSize: '0.825rem', color: 'var(--text-muted)' }}>
              🛡️ <b>Cơ chế Auto-Rollback:</b> Nếu quá trình build Vite bị lỗi cú pháp hoặc crash, script sẽ tự động khôi phục lại bản <code>dist/</code> trước đó và reload PM2 trong 0.5s để web không bao giờ bị sập.
            </div>
          </div>

          <div className="card">
            <h2 className="card-title">📋 Lịch Sử Triển Khai (Deploy Logs)</h2>
            {deployHistory.length > 0 ? (
              <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Thời gian</th>
                      <th>Commit</th>
                      <th>Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deployHistory.map(d => (
                      <tr key={d.id}>
                        <td style={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                          {new Date(d.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ({new Date(d.timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })})
                        </td>
                        <td>
                          <span style={{ 
                            fontFamily: 'var(--font-mono)', 
                            background: 'rgba(99, 102, 241, 0.2)', 
                            color: '#818cf8', 
                            padding: '0.2rem 0.45rem', 
                            borderRadius: '5px',
                            fontWeight: 700,
                            marginRight: '0.45rem',
                            fontSize: '0.8rem'
                          }}>
                            {d.commitHash || 'main'}
                          </span>
                          <span style={{ color: '#f1f5f9', fontSize: '0.825rem' }}>
                            {d.commitMessage || d.source}
                          </span>
                          {d.author && (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginLeft: '0.4rem' }}>
                              • {d.author}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`badge ${d.status === 'SUCCESS' ? 'badge-success' : 'badge-miss'}`}>
                            {d.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                Chưa có sự kiện deploy nào được ghi nhận.
              </div>
            )}
          </div>
        </section>
      )}

      {/* TAB 5: BACKUP & MONITORING */}
      {activeTab === 'backup' && (
        <section className="grid-2">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">📦 Sao Lưu Mã Hóa AES-256 (Định Kỳ 02:00 AM)</h2>
              <button onClick={handleRunBackup} className="btn btn-primary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                ⚡ Sao Lưu Ngay
              </button>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              CSDL MariaDB được xuất bằng <code>mariadb-dump</code>, nén Gzip level 9, mã hóa bằng <b>OpenSSL AES-256-CBC</b> và tự động xóa các bản cũ hơn 7 ngày.
            </p>

            <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
              {backups.length > 0 ? (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tên file sao lưu</th>
                      <th>Dung lượng</th>
                      <th>Mã hóa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map(b => (
                      <tr key={b.name}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#38bdf8' }}>{b.name}</td>
                        <td>{b.sizeKb} KB</td>
                        <td><span className="badge badge-success">AES-256-CBC</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                  Chưa có file backup nào. Bấm <b>"Sao Lưu Ngay"</b> để tạo bản đầu tiên!
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">🚨 Giám Sát &amp; Cảnh Báo Tức Thì</h2>
              <button onClick={handleTestAlert} className="btn btn-secondary" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}>
                🔔 Gửi Test Cảnh Báo
              </button>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Tiến trình ngầm kiểm tra liên tục CPU, RAM và Website. Bắn tin nhắn cảnh báo tức thì qua Telegram khi phát hiện sự cố:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <div className="playground-box">
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>NGƯỠNG CẢNH BÁO CPU</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f59e0b' }}>&gt; 85% Load</div>
              </div>
              <div className="playground-box">
                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>NGƯỠNG CẢNH BÁO RAM</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f59e0b' }}>&gt; 85% Usage</div>
              </div>
            </div>

            <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
              💡 Để nhận tin nhắn qua Telegram: Chỉ cần cập nhật <code>ALERT_TELEGRAM_BOT_TOKEN</code> và <code>ALERT_TELEGRAM_CHAT_ID</code> trong file <code>.env</code>.
            </div>
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer className="app-footer">
        CloudPanel Enterprise Stack &bull; MariaDB 11 &bull; Redis 7 &bull; PM2 Cluster &bull; UFW Firewall &bull; Encrypted AES-256
      </footer>
    </div>
  );
}
