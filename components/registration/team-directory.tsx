'use client';
import { useEffect, useState } from 'react';
import type { DirectoryTeam } from '@/lib/registration';
import { problem, send } from './forms';

export function TeamDirectory() {
  const [teams, setTeams] = useState<DirectoryTeam[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    send<DirectoryTeam[]>('/api/team/directory', 'GET')
      .then((data) => {
        if (active) setTeams(data);
      })
      .catch((err) => {
        if (active) setError(problem(err));
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  return (
    <section className="team-directory" aria-label="Other teams">
      {error ? (
        <p role="alert">
          {error}{' '}
          <button
            type="button"
            className="submission-action"
            onClick={() => {
              setError('');
              setAttempt((n) => n + 1);
            }}
          >
            Retry
          </button>
        </p>
      ) : teams === null ? (
        <p role="status">Loading teams…</p>
      ) : teams.length === 0 ? (
        <p>No other teams have registered yet.</p>
      ) : (
        <ul>
          {teams.map((team) => (
            <li key={team.name}>
              <strong>{team.name}</strong>
              <span>
                {team.members.length
                  ? team.members
                      .map(
                        ({ firstName, surname }) => `${firstName} ${surname}`,
                      )
                      .join(', ')
                  : 'Roster pending'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
