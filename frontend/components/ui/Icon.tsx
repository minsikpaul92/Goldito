import type { LucideIcon } from "lucide-react-native";
import ArrowUp from "lucide-react-native/icons/arrow-up";
import Bell from "lucide-react-native/icons/bell";
import Bone from "lucide-react-native/icons/bone";
import BookOpen from "lucide-react-native/icons/book-open";
import Calendar from "lucide-react-native/icons/calendar";
import Camera from "lucide-react-native/icons/camera";
import Car from "lucide-react-native/icons/car";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import Check from "lucide-react-native/icons/check";
import Clock from "lucide-react-native/icons/clock";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import Circle from "lucide-react-native/icons/circle";
import CircleCheck from "lucide-react-native/icons/circle-check";
import CircleDot from "lucide-react-native/icons/circle-dot";
import EyeOff from "lucide-react-native/icons/eye-off";
import FaceGrinning from "lucide-react-native/icons/face-grinning";
import FaceSlightlyFrowning from "lucide-react-native/icons/face-slightly-frowning";
import FaceSlightlySmiling from "lucide-react-native/icons/face-slightly-smiling";
import HandHeart from "lucide-react-native/icons/hand-heart";
import Heart from "lucide-react-native/icons/heart";
import Leaf from "lucide-react-native/icons/leaf";
import House from "lucide-react-native/icons/house";
import Image from "lucide-react-native/icons/image";
import Images from "lucide-react-native/icons/images";
import LogIn from "lucide-react-native/icons/log-in";
import LogOut from "lucide-react-native/icons/log-out";
import MapPin from "lucide-react-native/icons/map-pin";
import Menu from "lucide-react-native/icons/menu";
import MessageCircleMore from "lucide-react-native/icons/message-circle-more";
import Moon from "lucide-react-native/icons/moon";
import Mic from "lucide-react-native/icons/mic";
import Minus from "lucide-react-native/icons/minus";
import PawPrint from "lucide-react-native/icons/paw-print";
import NotebookPen from "lucide-react-native/icons/notebook-pen";
import Pill from "lucide-react-native/icons/pill";
import PartyPopper from "lucide-react-native/icons/party-popper";
import Plus from "lucide-react-native/icons/plus";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import CloudRain from "lucide-react-native/icons/cloud-rain";
import Settings from "lucide-react-native/icons/settings";
import Sprout from "lucide-react-native/icons/sprout";
import Sparkles from "lucide-react-native/icons/sparkles";
import Square from "lucide-react-native/icons/square";
import SquareCheck from "lucide-react-native/icons/square-check";
import Tag from "lucide-react-native/icons/tag";
import TriangleAlert from "lucide-react-native/icons/triangle-alert";
import User from "lucide-react-native/icons/user";
import TreePine from "lucide-react-native/icons/tree-pine";
import Users from "lucide-react-native/icons/users";
import Utensils from "lucide-react-native/icons/utensils";
import Video from "lucide-react-native/icons/video";
import Wind from "lucide-react-native/icons/wind";
import X from "lucide-react-native/icons/x";
import Zap from "lucide-react-native/icons/zap";

import { ChatPawIcon } from "./ChatPawIcon";

// One file per icon: the package root would pull all of Lucide into the bundle.

/**
 * The app's line icons, named by meaning (Lucide, picked Oct 22). Screens ask for `home` or `bell`, never a Lucide
 * name, so moving to another set (the Goldito illustrations, say) means changing this table only.
 */
const ICONS = {
  // tabs
  home: House,
  calendar: Calendar,
  feed: Images,
  diary: BookOpen,
  camera: Camera,
  chats: ChatPawIcon as unknown as LucideIcon,
  // header and menu
  bell: Bell,
  menu: Menu,
  settings: Settings,
  whatsNew: Sparkles,
  logOut: LogOut,
  // moving around
  back: ChevronLeft,
  forward: ChevronRight,
  expand: ChevronDown,
  close: X,
  // actions
  add: Plus,
  remove: Minus,
  send: ArrowUp,
  quick: Zap,
  mic: Mic,
  stop: Square,
  refresh: RefreshCw,
  // choices
  check: Check,
  clock: Clock,
  tip: NotebookPen,
  selected: CircleCheck,
  radioOn: CircleDot,
  radioOff: Circle,
  checkboxOn: SquareCheck,
  checkboxOff: Square,
  heart: Heart,
  // things
  person: User,
  people: Users,
  paw: PawPrint,
  place: MapPin,
  price: Tag,
  chat: MessageCircleMore,
  car: Car,
  received: LogIn,
  returned: LogOut,
  photo: Image,
  hidden: EyeOff,
  video: Video,
  warning: TriangleAlert,
  meal: Utensils,
  walk: TreePine,
  potty: Sprout,
  nap: Moon,
  pill: Pill,
  treat: Bone,
  // moods
  moodHappy: FaceSlightlySmiling,
  moodPlayful: FaceGrinning,
  moodExcited: PartyPopper,
  moodCalm: Leaf,
  moodTired: Moon,
  moodMissing: HandHeart,
  moodSad: FaceSlightlyFrowning,
  moodAnxious: Wind,
  moodRain: CloudRain,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

type Props = {
  name: IconName;
  size?: number;
  color: string;
  /** Solid shape, e.g. a saved favourite heart. */
  filled?: boolean;
  strokeWidth?: number;
  testID?: string;
};

/** A line icon, decorative: the control around it carries the label. */
export function Icon({ name, size = 24, color, filled, strokeWidth = 2, testID }: Props) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      size={size}
      color={color}
      fill={filled ? color : "none"}
      strokeWidth={strokeWidth}
      aria-hidden
      testID={testID}
    />
  );
}
