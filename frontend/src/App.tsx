import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './App.css'
import AppRouter from './routes/AppRouter';
import ErrorBoundary from './components/ErrorBoundary';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient} >
      <ErrorBoundary fallback={<div>Something went wrong</div>}>
        <AppRouter />
      </ErrorBoundary>
    </QueryClientProvider>
  )
}

export default App
