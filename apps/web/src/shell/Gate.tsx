import { VIEW_DESCRIPTIONS, type Coverage, type ViewId } from '@ootp/core';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { Locked } from '../ui/primitives.tsx';
import { listOf } from '../ui/text.ts';
import { gate, type Module } from './modules.ts';

const named = (views: readonly ViewId[]) =>
  listOf(views.map((view) => `${view} (${VIEW_DESCRIPTIONS[view].title.toLowerCase()})`));

/**
 * The lock framework's shared wrapper: a module that lacks a view it needs, or whose screen
 * isn't built yet, stays visible as the locked state and names what unlocks it. Panels
 * inside a screen use it the same way.
 */
export function Gate({
  module,
  coverage,
  clubhouse,
  children,
}: {
  module: Pick<Module, 'label' | 'needs' | 'arrives'>;
  coverage: Coverage;
  /** The Clubhouse tab's route, where uploads happen. */
  clubhouse: string;
  children: ReactNode;
}) {
  const state = gate(module, coverage);
  if (state.kind === 'open') {
    return children;
  }
  if (state.kind === 'arrives') {
    const needs =
      state.missing.length > 0
        ? `It will need ${named(state.missing)}, not on file yet.`
        : module.needs.length > 0
          ? 'Everything it needs is on file.'
          : 'It needs no upload.';
    return (
      <Locked
        title={`${module.label} arrives in ${state.phase}`}
        unlocks={`This screen is planned for ${state.phase}. ${needs}`}
      />
    );
  }
  return (
    <Locked
      title={`${module.label} is locked`}
      unlocks={
        <>
          Upload {named(state.missing)} to unlock it.{' '}
          <Link to={clubhouse}>Add data in the Clubhouse</Link>.
        </>
      }
    />
  );
}
