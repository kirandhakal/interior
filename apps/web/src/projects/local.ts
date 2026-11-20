import type { Project, SavedProject } from '@studio/model';

const STORAGE_KEY = 'room-paint-studio.projects.v1';

export function readLocalProjects(): SavedProject[] {
  try {
    const projects: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(projects) ? projects.filter(project =>
      project && typeof project.id === 'string' && typeof project.name === 'string' &&
      typeof project.version === 'number' && typeof project.updatedAt === 'string' &&
      Array.isArray(project.rooms) && project.rooms.length > 0) : [];
  } catch {
    return [];
  }
}

export function saveLocalProject(id: string, project: Project) {
  const projects = readLocalProjects();
  const saved: SavedProject = {
    ...project, id, version: (projects.find(item => item.id === id)?.version ?? 0) + 1, updatedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([saved, ...projects.filter(item => item.id !== id)]));
  } catch {
    throw new Error('Browser storage is unavailable or full. Sign in to save your project to your account.');
  }
  return saved;
}

export function removeLocalProject(id: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(readLocalProjects().filter(project => project.id !== id)));
}
