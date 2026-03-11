import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download } from 'lucide-react';

interface UserSession {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  generated_look_url: string | null;
  created_at: string;
  generation_count: number;
}

interface UsersTabProps {
  adminPin: string;
}

const FUNCTION_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const UsersTab: React.FC<UsersTabProps> = ({ adminPin }) => {
  const { data, isLoading, error } = useQuery<UserSession[]>({
    queryKey: ['admin-users', adminPin],
    queryFn: async () => {
      const res = await fetch(`${FUNCTION_BASE}/admin-users`, {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
          'x-admin-pin': adminPin,
        },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch users');
      return json.users;
    },
  });

  const exportCSV = () => {
    if (!data) return;
    const headers = ['Name', 'Email', 'Phone', 'Generated Look URL', 'Date', 'Generations'];
    const rows = data.map(u => [
      u.full_name || 'Guest',
      u.email || '',
      u.phone || '',
      u.generated_look_url || '',
      new Date(u.created_at).toLocaleString(),
      u.generation_count,
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vto-users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) return <p className="text-destructive p-4">Failed to load users.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {data?.length ?? 0} user{data?.length !== 1 ? 's' : ''} who generated a virtual look
        </p>
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={!data?.length}>
          <Download className="w-4 h-4 mr-1.5" /> Export CSV
        </Button>
      </div>

      {!data?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          No users have generated a look yet.
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Look</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Generations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map(user => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.full_name || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{user.phone || '—'}</TableCell>
                  <TableCell>
                    {user.generated_look_url ? (
                      <a href={user.generated_look_url} target="_blank" rel="noopener noreferrer">
                        <img src={user.generated_look_url} alt="Generated look" className="w-10 h-10 rounded object-cover hover:opacity-80 transition-opacity" />
                      </a>
                    ) : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {new Date(user.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">{user.generation_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};
