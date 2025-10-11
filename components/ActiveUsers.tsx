import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../src/firebaseConfig';
import Card from './common/Card';
import { UsersIcon } from './common/Icons';

const ActiveUsers: React.FC = () => {
    const [activeUsers, setActiveUsers] = useState<string[]>([]);

    useEffect(() => {
        const tenMinutesAgo = new Timestamp(Math.floor(Date.now() / 1000) - 600, 0);
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('lastSeen', '>', tenMinutesAgo));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const users = snapshot.docs.map(doc => doc.data().displayName || 'Anonymous');
            setActiveUsers(users);
        });

        return () => unsubscribe();
    }, []);

    return (
        <Card>
            <h2 className="text-2xl font-bold flex items-center gap-2 mb-4">
                <UsersIcon className="h-6 w-6 text-brand-green" /> Active Users (Last 10 Minutes)
            </h2>
            {activeUsers.length > 0 ? (
                <ul className="list-disc list-inside">
                    {activeUsers.map((name, index) => (
                        <li key={index}>{name}</li>
                    ))}
                </ul>
            ) : (
                <p className="text-night-500">No users have been active in the last 10 minutes.</p>
            )}
        </Card>
    );
};

export default ActiveUsers;