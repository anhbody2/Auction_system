import { useEffect } from 'react';
import { useAuth } from '../auth';
import { creditCleared, creditLoaded } from './creditSlice';
import { useAppDispatch, useAppSelector } from './index';
import { useUserEvents } from './useUserEvents';

/**
 * crd-003: keeps the credit slice in step with the signed-in user. The user object only changes on page
 * load, login and an explicit refresh() (deposit, withdrawal, profile save), so credit is taken from it
 * only then. Mounted once, in Layout.
 */
export function useCreditSync() {
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  useEffect(() => {
    if (user?.role === 'customer') dispatch(creditLoaded({ credit: user.creditBalance, locked: user.heldBalance }));
    else dispatch(creditCleared());
  }, [user, dispatch]);
  useUserEvents(user?.role === 'customer', user?.id);
}

/** Credit and locked credit to show; falls back to the user object until the slice is filled. */
export function useCredit() {
  const { user } = useAuth();
  const { credit, locked } = useAppSelector((s) => s.credit);
  return { credit: credit ?? user?.creditBalance ?? 0, locked: locked ?? user?.heldBalance ?? 0 };
}
