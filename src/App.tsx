import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes';

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="noise-mapper-theme">
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
