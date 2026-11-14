require('dotenv').config();
const readline = require('readline');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function ask(q){return new Promise(resolve=>rl.question(q,resolve));}
function askHidden(prompt){
 return new Promise((resolve,reject)=>{
  if(!process.stdin.isTTY) return reject(new Error('Jalankan perintah ini dari terminal interaktif.'));
  process.stdout.write(prompt);
  const stdin=process.stdin; let value='';
  stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
  const onData=ch=>{
   if(ch==='\u0003'){stdin.setRawMode(false);reject(new Error('Dibatalkan.'));return;}
   if(ch==='\r'||ch==='\n'){stdin.setRawMode(false);stdin.pause();stdin.removeListener('data',onData);process.stdout.write('\n');resolve(value);return;}
   if(ch==='\u007f'||ch==='\b'){value=value.slice(0,-1);return;}
   value+=ch;
  };
  stdin.on('data',onData);
 });
}
(async()=>{
 if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL belum diatur.');
 const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.PGSSL==='true'?{rejectUnauthorized:false}:undefined});
 try{
  const exists=await pool.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
  if(exists.rowCount) throw new Error('Admin sudah ada. Login lalu ubah email/password melalui dashboard.');
  const email=(await ask('Email admin: ')).trim().toLowerCase();
  rl.close();
  if(!/^[^\s@]+@[^\s@]+\\.[^\s@]+$/.test(email)) throw new Error('Format email tidak valid.');
  const password=await askHidden('Password admin (min. 12 karakter, input disembunyikan): ');
  if(password.length<12) throw new Error('Password minimal 12 karakter.');
  const hash=await bcrypt.hash(password,12);
  await pool.query("INSERT INTO users(name,email,password_hash,role) VALUES('Administrator',$1,$2,'admin')",[email,hash]);
  console.log('Admin berhasil dibuat. Password disimpan sebagai hash bcrypt.');
 }finally{rl.close();await pool.end();}
})().catch(e=>{console.error(e.message);rl.close();process.exit(1);});
