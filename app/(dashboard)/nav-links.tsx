'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/apps', label: 'Apps' },
  { href: '/billing', label: 'Billing' },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {links.map(({ href, label }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/');
        return (
          <Link
            key={href}
            href={href}
            className="hover:text-gray-200"
            {...(isActive ? { 'data-active-tab': label } : {})}
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}
