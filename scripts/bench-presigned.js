import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = 'http://localhost:3000';
const ACCESS_TOKEN = __ENV.ACCESS_TOKEN;
const ROOM_ID = __ENV.ROOM_ID;

export const options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '30s', target: 50 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const payload = JSON.stringify({
    roomId: ROOM_ID,
    files: [
      { name: 'photo1.jpg', size: 5242880, contentType: 'image/jpeg' },
      { name: 'photo2.jpg', size: 3145728, contentType: 'image/jpeg' },
      { name: 'photo3.jpg', size: 4194304, contentType: 'image/jpeg' },
    ],
  });

  const res = http.post(`${BASE_URL}/photos/presigned-urls`, payload, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  check(res, {
    'status 201': (r) => r.status === 201,
    'returns 3 items': (r) => JSON.parse(r.body).length === 3,
    'has url': (r) => JSON.parse(r.body)[0]?.original?.url !== undefined,
  });

  sleep(0.1);
}
