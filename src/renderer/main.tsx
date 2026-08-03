import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { TableConfigStoreProvider } from './state/TableConfigStore';
import { ContextMenuHost } from './context-menu/ContextMenuHost';

const root = createRoot(document.getElementById('root')!);
root.render(
  <TableConfigStoreProvider>
    <App />
    <ContextMenuHost />
  </TableConfigStoreProvider>
);
