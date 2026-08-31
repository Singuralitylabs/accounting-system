import Link from "next/link";
import type { IconType } from "react-icons";
import {
  FaChartLine,
  FaCog,
  FaFileInvoiceDollar,
  FaRegIdCard,
} from "react-icons/fa";
import type { NavItem } from "../utils/permissions";

const NAV_ICONS: Record<string, IconType> = {
  "/matters": FaRegIdCard,
  "/profit-loss": FaChartLine,
  "/budget-declarations": FaFileInvoiceDollar,
  "/dashboard": FaCog,
};

type Props = {
  items: NavItem[];
};

const NavigationHub = ({ items }: Props) => {
  return (
    <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const Icon = NAV_ICONS[item.href] ?? FaRegIdCard;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:border-gray-400 hover:shadow-md"
          >
            <div className="flex items-start gap-4">
              <div className="shrink-0 rounded-lg bg-gray-800 p-3 text-white">
                <Icon size="1.5rem" aria-hidden />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {item.label}
                </h2>
                <p className="mt-1 text-sm text-gray-600">{item.description}</p>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
};

export default NavigationHub;
