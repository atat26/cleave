// Imported first by main.ts, so the data folder is chosen before anything reads it.
import { app } from 'electron';
import { dataFolderPath } from './dataFolder';

app.setPath('userData', dataFolderPath(app.getPath('appData'), app.isPackaged));
