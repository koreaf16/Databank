/**
 * @module components/features/sidebar/parts/ProjectsSection
 * @description 프로젝트 목록 섹션
 * @usage <ProjectsSection currentChannel={id} onChannel={fn}/>
 * @related ChannelPanel.jsx
 */
import React from 'react';
import { SidebarSection } from './SidebarSection.jsx';

export function ProjectsSection({ currentChannel, onChannel }) {
  const [open, setOpen] = React.useState(false);
  const projects: any[] = [];

  if (projects.length === 0) return null;

  return (
    <SidebarSection
      label="프로젝트"
      open={open}
      onToggle={() => setOpen(v => !v)}
      meta={projects.reduce((n, p) => n + (p.unread || 0), 0) || null}
    >
      {projects.map(project => (
        <button
          key={project.id}
          className={`sb-ch${currentChannel === project.id ? ' on' : ''}${project.unread > 0 ? ' unread' : ''}`}
          onClick={() => onChannel({ ...project, kind: 'project' })}
        >
          <span className="sb-ch-prefix">{project.emoji}</span>
          <span className="sb-ch-name">{project.name}</span>
          {project.mentioned && <span className="sb-ch-mention">@</span>}
          {project.unread > 0 && <span className="sb-badge sm">{project.unread}</span>}
        </button>
      ))}
    </SidebarSection>
  );
}
