const fs = require('fs');
const path = require('path');

const filePath = 'c:\\MIS 1\\src\\presentation\\views\\StudentQuizAccessView.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Replace background color of the main shell
content = content.replace(/bg-\[#faf9f5\] dark:bg-\[#181715\]/g, 'bg-white dark:bg-neutral-950');

// Header
content = content.replace(/bg-\[#efe9de\] dark:bg-\[#252320\] flex items-center justify-center text-\[#cc785c\]/g, 'bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400');
content = content.replace(/text-\[#141413\] dark:text-\[#faf9f5\]/g, 'text-neutral-900 dark:text-neutral-50');

// Title / Descriptions
content = content.replace(/text-\[#3d3d3a\] dark:text-\[#a09d96\]/g, 'text-neutral-500 dark:text-neutral-400');

// Main Card
content = content.replace(/bg-\[#efe9de\] dark:bg-\[#252320\] p-8 rounded-\[12px\] shadow-sm border border-\[#e8e0d2\] dark:border-\[#1f1e1b\]/g, 'bg-white dark:bg-neutral-900 p-8 rounded-3xl shadow-sm border border-neutral-200 dark:border-white/10');

// StepTracker
content = content.replace(/bg-\[#cc785c\] text-white/g, 'bg-emerald-500 text-white');
content = content.replace(/bg-\[#cc785c\]/g, 'bg-emerald-500');
content = content.replace(/bg-\[#e8e0d2\] dark:bg-\[#252320\]/g, 'bg-neutral-200 dark:bg-white/10');
content = content.replace(/border-\[#e8e0d2\] dark:border-\[#252320\]/g, 'border-neutral-200 dark:border-white/10');
content = content.replace(/text-\[#8e8b82\]/g, 'text-neutral-400');

// Inputs
content = content.replace(/border-white\/20 dark:border-white\/10 rounded-xl bg-white\/40 dark:bg-\[#0f172a\]\/60 backdrop-blur-xl/g, 'border-neutral-200 dark:border-white/10 rounded-2xl bg-neutral-50 dark:bg-neutral-900/50');
content = content.replace(/focus:border-\[#15157d\] dark:border-\[#818cf8\]/g, 'focus:border-emerald-500 dark:focus:border-emerald-500');
content = content.replace(/shadow-\[inset_2px_2px_5px_#BABECC,inset_-2px_-2px_5px_#ffffff73\] dark:shadow-\[inset_2px_2px_5px_#020617,inset_-2px_-2px_5px_#1e293b73\]/g, 'shadow-sm');

// Buttons
content = content.replace(/bg-\[#15157d\] dark:bg-\[#818cf8\] hover:bg-\[#15157d\]\/90 text-white shadow-\[-4px_-4px_10px_rgba\(255,255,255,0\.8\),4px_4px_10px_rgba\(0,0,0,0\.1\)\] dark:shadow-\[-4px_-4px_10px_rgba\(255,255,255,0\.03\),4px_4px_10px_rgba\(0,0,0,0\.5\)\]/g, 'bg-neutral-900 dark:bg-neutral-200 text-neutral-50 dark:text-neutral-900 hover:opacity-90 shadow-sm');
content = content.replace(/text-\[#15157d\] dark:text-\[#818cf8\]/g, 'text-emerald-600 dark:text-emerald-400');
content = content.replace(/border-\[#15157d\] dark:border-\[#818cf8\]/g, 'border-emerald-600 dark:border-emerald-400');

// Modals / Dropdowns
content = content.replace(/bg-\[#efe9de\] dark:bg-\[#252320\]/g, 'bg-white dark:bg-neutral-900');
content = content.replace(/hover:bg-\[#e8e0d2\] dark:hover:bg-\[#1f1e1b\]/g, 'hover:bg-neutral-100 dark:hover:bg-neutral-800');

// Info Boxes
content = content.replace(/bg-\[#e8e0d2\] dark:bg-\[#1f1e1b\]/g, 'bg-neutral-100 dark:bg-neutral-800');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully updated StudentQuizAccessView to Luma design');
