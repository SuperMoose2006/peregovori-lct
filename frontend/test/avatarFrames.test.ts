import test from 'node:test';
import assert from 'node:assert/strict';
import {AvatarFrames} from '../src/lib/avatarFrames';

test('provider frames follow PCM timestamps, expire, and cannot survive interruption',()=>{
 const q=new AvatarFrames();
 q.push({generation_id:'a',pts_ms:100,jpeg:'/9j/2Q=='});
 assert.equal(q.at(null),null);assert.equal(q.at(99),null);
 assert.equal(q.at(100),'data:image/jpeg;base64,/9j/2Q==');
 assert.equal(q.at(351),null);
 q.clear();q.push({generation_id:'a',pts_ms:0,jpeg:'/9j/2Q=='});
 assert.equal(q.at(0),null);
 q.push({generation_id:'b',pts_ms:0,jpeg:'/9j/2Q=='});
 assert.ok(q.at(0));
});

test('malformed or oversized packets never become an image',()=>{
 for(const event of [{pts_ms:-1,jpeg:'a'}, {pts_ms:NaN,jpeg:'a'},
  {pts_ms:0,jpeg:'javascript:evil'}, {pts_ms:0,jpeg:'a'.repeat(180001)}]){
  const q=new AvatarFrames();q.push({generation_id:'a',...event});assert.equal(q.at(0),null);
 }
});
