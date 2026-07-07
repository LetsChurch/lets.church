// Derive a human-friendly default upload title from an original file name.
// Drops the extension, turns slug separators (-, _, .) and whitespace runs into
// single spaces, and title-cases the result:
//   "my-great-sermon.mp4"       -> "My Great Sermon"
//   "2024_01_05_sunday-service" -> "2024 01 05 Sunday Service"
// Returns '' when nothing usable remains, so callers can fall back.
export function titleFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[a-z0-9]{1,8}$/i, '') // drop a trailing file extension
    .replace(/[_\-.]+/g, ' ') // slug separators -> spaces
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
