// Entry point that mounts the React application into index.html.
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles/appStyles.css';

createRoot(document.getElementById('root')).render(<App />);
