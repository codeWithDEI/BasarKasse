import {defineConfig,devices} from '@playwright/test';
import {readFileSync} from 'node:fs';
const basePath=JSON.parse(readFileSync('.next/required-server-files.json','utf8')).config.basePath;
export default defineConfig({
 testDir:'./tests/browser',fullyParallel:false,workers:1,retries:0,forbidOnly:!!process.env.CI,
 timeout:45000,expect:{timeout:15000},reporter:'list',
 use:{baseURL:'http://127.0.0.1:3138'+basePath,trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'chromium',use:{...devices['Galaxy Tab S9']}},{name:'webkit',use:{...devices['iPad (gen 7)'],defaultBrowserType:'webkit'}}],
 webServer:{command:'node scripts/recovery-test-server.mjs',url:'http://127.0.0.1:3138'+basePath+'/api/basar',reuseExistingServer:false,timeout:30000,gracefulShutdown:{signal:'SIGTERM',timeout:5000}},
});
