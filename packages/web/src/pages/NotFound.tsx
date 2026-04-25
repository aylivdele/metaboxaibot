import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-bg">
      <div className="text-center anim-page-in">
        <div className="brand-text text-6xl font-bold mb-4">404</div>
        <p className="text-text-secondary mb-6">Страница не найдена</p>
        <Link to="/" className="btn-primary">
          На главную
        </Link>
      </div>
    </div>
  );
}
