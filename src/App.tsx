import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { ReadingsProvider } from './contexts/ReadingsContext';
import { BrowserRouter } from 'react-router-dom';
import AppRoutes from './routes';

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="noise-mapper-theme">
      <AuthProvider>
        {/* One readings cache for every route (master §4.5); idle until sign-in. */}
        <ReadingsProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ReadingsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
