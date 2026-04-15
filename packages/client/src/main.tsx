import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { DataProvider } from './context/DataContext.tsx'
import { PlanProvider } from './context/PlanContext.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <DataProvider>
        <PlanProvider>
          <App />
        </PlanProvider>
      </DataProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
