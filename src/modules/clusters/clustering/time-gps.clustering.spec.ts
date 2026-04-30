import { clusterByTimeGps, PhotoInput } from './time-gps.clustering';

describe('clusterByTimeGps', () => {
  it('returns empty array for empty input', () => {
    expect(clusterByTimeGps([])).toEqual([]);
  });

  it('groups photos by calendar day into Day 1, Day 2...', () => {
    const photos: PhotoInput[] = [
      {
        id: 'p1',
        takenAt: new Date('2025-07-15T09:00:00Z'),
        lat: null,
        lng: null,
      },
      {
        id: 'p2',
        takenAt: new Date('2025-07-15T14:00:00Z'),
        lat: null,
        lng: null,
      },
      {
        id: 'p3',
        takenAt: new Date('2025-07-16T10:00:00Z'),
        lat: null,
        lng: null,
      },
    ];

    const result = clusterByTimeGps(photos);

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('Day 1');
    expect(result[0].dayNumber).toBe(1);
    expect(result[0].photoIds).toEqual(expect.arrayContaining(['p1', 'p2']));
    expect(result[1].title).toBe('Day 2');
    expect(result[1].dayNumber).toBe(2);
    expect(result[1].photoIds).toEqual(['p3']);
  });

  it('puts photos without takenAt into Uncategorized group', () => {
    const photos: PhotoInput[] = [
      { id: 'p1', takenAt: null, lat: null, lng: null },
      {
        id: 'p2',
        takenAt: new Date('2025-07-15T09:00:00Z'),
        lat: null,
        lng: null,
      },
    ];

    const result = clusterByTimeGps(photos);

    expect(result).toHaveLength(2);
    const dated = result.find((g) => g.dayNumber !== null)!;
    const undated = result.find((g) => g.dayNumber === null)!;
    expect(dated.photoIds).toEqual(['p2']);
    expect(undated.title).toBe('Uncategorized');
    expect(undated.photoIds).toEqual(['p1']);
  });

  it('assigns dayNumbers in chronological order regardless of input order', () => {
    const photos: PhotoInput[] = [
      {
        id: 'p1',
        takenAt: new Date('2025-07-17T09:00:00Z'),
        lat: null,
        lng: null,
      },
      {
        id: 'p2',
        takenAt: new Date('2025-07-15T09:00:00Z'),
        lat: null,
        lng: null,
      },
      {
        id: 'p3',
        takenAt: new Date('2025-07-16T09:00:00Z'),
        lat: null,
        lng: null,
      },
    ];

    const result = clusterByTimeGps(photos);

    expect(result[0].dayNumber).toBe(1);
    expect(result[0].photoIds).toEqual(['p2']);
    expect(result[1].dayNumber).toBe(2);
    expect(result[1].photoIds).toEqual(['p3']);
    expect(result[2].dayNumber).toBe(3);
    expect(result[2].photoIds).toEqual(['p1']);
  });

  it('handles all undated photos', () => {
    const photos: PhotoInput[] = [
      { id: 'p1', takenAt: null, lat: null, lng: null },
      { id: 'p2', takenAt: null, lat: null, lng: null },
    ];
    const result = clusterByTimeGps(photos);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Uncategorized');
    expect(result[0].photoIds).toHaveLength(2);
  });
});
