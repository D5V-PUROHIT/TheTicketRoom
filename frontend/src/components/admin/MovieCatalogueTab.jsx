// Tab 3 of Admin Dashboard: form to publish new upcoming movies and table listing all movies in the database.
import { formatDateWithDay, formatTime12h } from '../../utils/formatters';

export default function MovieCatalogueTab({
  newMovieForm,
  setNewMovieForm,
  newMovieCalDate,
  setNewMovieCalDate,
  newMovieCalTime,
  setNewMovieCalTime,
  handleAddNewMovie,
  moviesHistory,
  busy,
}) {
  return (
    <>
      <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 22, background: '#fff', marginBottom: 24 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>Add Movie to Catalogue</h3>
        <p style={{ color: 'var(--mute)', fontSize: 12.5, marginBottom: 16 }}>
          Publish a new upcoming movie title to the theatre catalogue.
        </p>
        <form onSubmit={handleAddNewMovie}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Title</label>
              <input type="text" required placeholder="e.g. Baahubali 2: The Conclusion" style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6 }} value={newMovieForm.title} onChange={(e) => setNewMovieForm({ ...newMovieForm, title: e.target.value })} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Poster URL</label>
              <input type="text" placeholder="/posters/bahubali.jpg" style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6 }} value={newMovieForm.poster_url} onChange={(e) => setNewMovieForm({ ...newMovieForm, poster_url: e.target.value })} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Genres</label>
              <input type="text" placeholder="Action • Epic • Drama" style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6 }} value={newMovieForm.genres} onChange={(e) => setNewMovieForm({ ...newMovieForm, genres: e.target.value })} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Language</label>
              <input type="text" placeholder="Hindi, Telugu" style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6 }} value={newMovieForm.language} onChange={(e) => setNewMovieForm({ ...newMovieForm, language: e.target.value })} />
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Synopsis</label>
            <textarea rows={2} placeholder="Plot summary..." style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 6, font: 'inherit', fontSize: 13 }} value={newMovieForm.synopsis} onChange={(e) => setNewMovieForm({ ...newMovieForm, synopsis: e.target.value })} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Premiere Date</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="date" aria-label="New movie premiere date" value={newMovieCalDate}
                  onChange={(e) => { setNewMovieCalDate(e.target.value); setNewMovieForm((p) => ({ ...p, date_str: formatDateWithDay(e.target.value) })); }}
                  style={{ padding: '8px 10px', border: '1.5px solid var(--accent)', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#faf9ff', color: 'var(--ink)' }}
                />
                <input type="text" placeholder="e.g. Friday, 4 December, 2026" value={newMovieForm.date_str} onChange={(e) => setNewMovieForm({ ...newMovieForm, date_str: e.target.value })} style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13, fontWeight: 600 }} />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Premiere Showtime</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="time" aria-label="New movie premiere showtime" value={newMovieCalTime}
                  onChange={(e) => { setNewMovieCalTime(e.target.value); setNewMovieForm((p) => ({ ...p, time_str: formatTime12h(e.target.value) })); }}
                  style={{ padding: '8px 10px', border: '1.5px solid var(--accent)', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', background: '#faf9ff', color: 'var(--ink)' }}
                />
                <input type="text" placeholder="e.g. 08:00 PM" value={newMovieForm.time_str} onChange={(e) => setNewMovieForm({ ...newMovieForm, time_str: e.target.value })} style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 6, fontSize: 13, fontWeight: 600 }} />
              </div>
            </div>
          </div>

          <button type="submit" disabled={busy} className="btn-primary" style={{ padding: '10px 22px' }}>
            {busy ? 'Publishing...' : 'Publish Movie'}
          </button>
        </form>
      </div>

      <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 22, background: '#fff', marginBottom: 24 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Movies in Database ({moviesHistory.length})</h3>
        <p style={{ color: 'var(--mute)', fontSize: 12.5, marginBottom: 14 }}>Previous and current movies stored in the cinema catalogue.</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--line)', color: 'var(--mute)', textAlign: 'left' }}>
              <th style={{ padding: '9px 8px' }}>ID</th>
              <th style={{ padding: '9px 8px' }}>Title</th>
              <th style={{ padding: '9px 8px' }}>Language</th>
              <th style={{ padding: '9px 8px' }}>Certificate</th>
              <th style={{ padding: '9px 8px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {moviesHistory.map((m) => (
              <tr key={m.id} style={{ borderBottom: '1px solid var(--line)' }}>
                <td style={{ padding: '9px 8px' }}>#{m.id}</td>
                <td style={{ padding: '9px 8px' }}><b>{m.title}</b></td>
                <td style={{ padding: '9px 8px' }}>{m.language}</td>
                <td style={{ padding: '9px 8px' }}>{m.certificate}</td>
                <td style={{ padding: '9px 8px' }}>
                  <span style={{ background: 'var(--mint-soft)', color: 'var(--mint)', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                    {m.status || 'Active'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
