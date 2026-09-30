const KEY = 'starlight-high-score';
export function getHighScore(){ return Number(localStorage.getItem(KEY) || 0); }
export function saveHighScore(value){ const old=getHighScore(); if(value>old) localStorage.setItem(KEY,String(value)); return Math.max(old,value); }
