# Process Media Workflow

```mermaid
sequenceDiagram
  participant bww as Background Worker Workflow
  participant bwa as Background Worker Activity
  participant tcw as Transcode Worker Activity
  participant tsw as Transcribe Worker Activity
  bww->>tcw: Probe Activity
  tcw->>bww: Result
  bww->>tcw: Transcode Activity
  loop
    tcw-->>bwa: Record Progress
  end
  bww->>tsw: Transcribe Activity
  tcw->>bww: Result
  tsw->>bww: Result
  bww->>bwa: Index Transcript?
```
