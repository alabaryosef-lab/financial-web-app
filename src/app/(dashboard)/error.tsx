'use client';

import React from 'react';

const SERVER_ACTION_ERROR = 'Failed to find Server Action';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error(error);
  const isStaleDeploy = error?.message?.includes(SERVER_ACTION_ERROR);

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center p-4">
      <p className="text-neutral-700 mb-4">
        {isStaleDeploy
          ? 'The app was updated. Please refresh the page to load the latest version.'
          : 'Something went wrong.'}
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={isStaleDeploy ? handleRefresh : () => reset()}
          className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600"
        >
          {isStaleDeploy ? 'Refresh page' : 'Try again'}
        </button>
        {!isStaleDeploy && (
          <button
            type="button"
            onClick={handleRefresh}
            className="px-4 py-2 border border-neutral-300 rounded-lg hover:bg-neutral-100"
          >
            Refresh page
          </button>
        )}
      </div>
    </div>
  );
}
