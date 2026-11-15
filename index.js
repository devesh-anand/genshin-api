import * as dotenv from 'dotenv';
dotenv.config();
import { createApp } from './app.js';

const PORT = process.env.PORT || 5000;

createApp().listen(PORT, () => {
   console.log(`app running on port ${PORT}`);
});
