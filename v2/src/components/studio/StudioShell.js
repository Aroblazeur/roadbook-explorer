export default function StudioShell({ children }) {
  return (
    <div className="studio-page">
      <header className="header studio-header">
        <div className="container">
          <h1>RoadBook Studio</h1>
          <p className="studio-header__subtitle">Créer, éditer et publier vos roadbooks.</p>
        </div>
      </header>
      <main className="container studio-layout studio-layout--v1">{children}</main>
      <footer className="studio-footer">
        <p>RoadBook Studio · V2</p>
      </footer>
    </div>
  );
}
