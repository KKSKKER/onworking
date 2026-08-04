import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { TableConfigStoreProvider } from './state/TableConfigStore';
import { ContextMenuHost } from './context-menu/ContextMenuHost';
import { setCatalog } from '../common/i18n';
import zh from '../../i18n/zh.json';

setCatalog(zh);

const root = createRoot(document.getElementById('root')!);
root.render(
  <TableConfigStoreProvider>
    <App />
    <ContextMenuHost />
  </TableConfigStoreProvider>
);
