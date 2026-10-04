import { createBrowserRouter, Navigate, Outlet } from 'react-router';

import { RequireSession } from './auth.tsx';
import { ComingSoon } from './screens/ComingSoon.tsx';
import { Home } from './screens/Home.tsx';
import { ModuleScreen } from './screens/Module.tsx';
import { NotFound } from './screens/NotFound.tsx';
import { Root } from './screens/Root.tsx';
import { RouteError } from './screens/RouteError.tsx';
import { SignIn } from './screens/SignIn.tsx';
import { TeamHome } from './screens/TeamHome.tsx';
import { TeamsScreen } from './screens/Teams.tsx';
import { Shell } from './shell/Shell.tsx';
import { Sheet } from './sheet/Sheet.tsx';

/**
 * The routes from docs/implementation-plan.md › Frontend foundation. Every screen has its own
 * error boundary (errorElement), so one screen's crash never blanks the app.
 */
export const router = createBrowserRouter([
  {
    path: '/',
    element: <Root />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Home /> },
      { path: 'sheet', element: <Sheet />, errorElement: <RouteError /> },
      { path: 'sign-in', element: <SignIn />, errorElement: <RouteError /> },
      {
        element: (
          <RequireSession>
            <Outlet />
          </RequireSession>
        ),
        errorElement: <RouteError />,
        children: [
          { path: 'teams', element: <TeamsScreen />, errorElement: <RouteError /> },
          {
            path: 'teams/new',
            element: <ComingSoon screen="Create a team" item="Team menu and Create a Team" />,
          },
          {
            path: 't/:team/settings',
            element: (
              <ComingSoon screen="Team settings" item="Team settings, Export team and restore" />
            ),
          },
          { path: 't/:team', element: <TeamHome />, errorElement: <RouteError /> },
          {
            path: 't/:team/s/:snapshot',
            element: <Shell />,
            errorElement: <RouteError />,
            children: [
              { index: true, element: <Navigate to="clubhouse" replace /> },
              { path: ':tab', element: <ModuleScreen />, errorElement: <RouteError /> },
            ],
          },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
