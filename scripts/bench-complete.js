import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL = 'http://localhost:3000';
const ACCESS_TOKEN = __ENV.ACCESS_TOKEN;

export const options = {
  stages: [
    { duration: '10s', target: 5 },
    { duration: '20s', target: 20 },
    { duration: '10s', target: 0 },
  ],
};

export function setup() {
  const rooms = [];
  for (let i = 0; i < 20; i++) {
    const res = http.post(
      `${BASE_URL}/rooms`,
      JSON.stringify({ title: `Bench Room ${i}` }),
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      },
    );
    rooms.push(JSON.parse(res.body).id);
  }
  return { rooms };
}

export default function (data) {
  const roomId = data.rooms[(__VU - 1) % data.rooms.length];
  const photoId = uuidv4();
  const payload = JSON.stringify({
    roomId,
    photos: [
      {
        photoId,
        s3Key: `rooms/${roomId}/photos/${photoId}.jpg`,
        thumbnailKey: `rooms/${roomId}/thumbs/${photoId}.jpg`,
        fileSize: 5242880,
        width: 4032,
        height: 3024,
        takenAt: new Date().toISOString(),
        lat: 33.4996,
        lng: 126.5312,
      },
    ],
  });

  const res = http.post(`${BASE_URL}/photos/complete`, payload, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  check(res, {
    'status 201': (r) => r.status === 201,
  });

  sleep(0.2);
}
