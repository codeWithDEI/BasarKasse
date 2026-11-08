import type {Metadata} from 'next';
import './globals.css';
import {basarPath} from '@/lib/basar/paths';
export const metadata:Metadata={title:'Basarkasse · Rötgesbüttel',description:'Kleine Dinge. Große Freude. Die übersichtliche Basarkasse für Rötgesbüttel.',icons:{icon:basarPath('/favicon.svg')}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="de"><body>{children}</body></html>}
