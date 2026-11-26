'use client';

import { useState } from 'react';
import type { Boot } from '@/lib/data/boot';
import './admin.css';
import { CateringScreen } from './CateringScreen';
import { DeliveryStatusScreen } from './DeliveryStatusScreen';
import { FormattingScreen } from './FormattingScreen';
import { LocationsScreen } from './LocationsScreen';
import { MappingScreen } from './MappingScreen';
import { PeopleScreen } from './PeopleScreen';
import { WeeksScreen } from './WeeksScreen';

const SCREENS = ['Weeks & data', 'Catering', 'Delivery apps', 'Mapping', 'Locations', 'People & access', 'Formatting'] as const;
type Screen = (typeof SCREENS)[number];

interface Props {
  boot: Boot;
  weeks: { weekStart: string; label: string }[];
  /** Dining options in the open week that the mapping does not know yet. */
  unmapped: number;
}

export function AdminPanel({ boot, unmapped }: Props) {
  const [screen, setScreen] = useState<Screen>('Weeks & data');
  return (
    <div className="adm">
      <div className="filters" style={{ justifyContent: 'space-between' }}>
        <span className="eyebrow" style={{ margin: 0 }}>Admin</span>
        <div className="seg" role="tablist" style={{ margin: 0 }}>
          {SCREENS.map((s) => (
            <button key={s} role="tab" aria-selected={s === screen} className={s === screen ? 'on' : ''} onClick={() => setScreen(s)}>{s}</button>
          ))}
        </div>
      </div>
      {unmapped > 0 && screen !== 'Mapping' && (
        <div className="msg warn">
          {unmapped} dining option{unmapped === 1 ? '' : 's'} in the week on screen {unmapped === 1 ? 'is' : 'are'} not mapped. Their sales are counted on the Unmapped line.{' '}
          <button className="btn ghost sm" onClick={() => setScreen('Mapping')}>Open Mapping</button>
        </div>
      )}
      {screen === 'Weeks & data' && <WeeksScreen currentWeek={boot.week.weekStart} />}
      {screen === 'Catering' && <CateringScreen currentWeek={boot.week.weekStart} />}
      {screen === 'Delivery apps' && <DeliveryStatusScreen />}
      {screen === 'Mapping' && <MappingScreen />}
      {screen === 'Locations' && <LocationsScreen />}
      {screen === 'People & access' && <PeopleScreen meEmail={boot.user.email} />}
      {screen === 'Formatting' && <FormattingScreen />}
    </div>
  );
}
