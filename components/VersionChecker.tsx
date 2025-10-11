import React, { useState, useEffect } from 'react';

const VersionChecker: React.FC = () => {
  const [initialVersion, setInitialVersion] = useState<string | null>(null);

  useEffect(() => {
    // Fetch the initial version when the component mounts
    fetch('/version.json')
      .then((res) => res.json())
      .then((data) => {
        setInitialVersion(data.version);
      });

    // Set up an interval to check for new versions every 5 minutes
    const interval = setInterval(() => {
      fetch('/version.json', { cache: 'no-store' }) // Ensure we are not getting a cached version
        .then((res) => res.json())
        .then((data) => {
          if (initialVersion && initialVersion !== data.version) {
            // New version detected, force a reload
            alert('A new version of the site is available. The page will now reload.');
            window.location.reload();
          }
        });
    }, 300000); // 5 minutes

    return () => clearInterval(interval);
  }, [initialVersion]);

  return null; // This component doesn't render anything
};

export default VersionChecker;