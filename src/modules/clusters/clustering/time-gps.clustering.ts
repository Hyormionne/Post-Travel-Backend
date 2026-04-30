export interface PhotoInput {
  id: string;
  takenAt: Date | null;
  lat: number | null;
  lng: number | null;
}

export interface ClusterGroup {
  title: string;
  dayNumber: number | null;
  photoIds: string[];
}

export function clusterByTimeGps(photos: PhotoInput[]): ClusterGroup[] {
  if (photos.length === 0) return [];

  const dated = photos.filter((p) => p.takenAt !== null);
  const undated = photos.filter((p) => p.takenAt === null);

  dated.sort((a, b) => a.takenAt!.getTime() - b.takenAt!.getTime());

  const dayMap = new Map<string, string[]>();
  for (const photo of dated) {
    const dateKey = photo.takenAt!.toISOString().slice(0, 10);
    if (!dayMap.has(dateKey)) dayMap.set(dateKey, []);
    dayMap.get(dateKey)!.push(photo.id);
  }

  const sortedDates = [...dayMap.keys()].sort();
  const groups: ClusterGroup[] = sortedDates.map((date, idx) => ({
    title: `Day ${idx + 1}`,
    dayNumber: idx + 1,
    photoIds: dayMap.get(date)!,
  }));

  if (undated.length > 0) {
    groups.push({
      title: 'Uncategorized',
      dayNumber: null,
      photoIds: undated.map((p) => p.id),
    });
  }

  return groups;
}
