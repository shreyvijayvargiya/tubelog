import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AppShell } from "./components/layout/AppShell.jsx";
import { TooltipProvider } from "./components/ui/menu.jsx";
import { useTheme } from "./lib/theme.jsx";
import { BlogsPage } from "./pages/Blogs.jsx";
import { ChannelPage } from "./pages/Channel.jsx";
import { ChannelsPage } from "./pages/Channels.jsx";
import { DashboardPage } from "./pages/Dashboard.jsx";
import { DiscoverChannelPage } from "./pages/DiscoverChannel.jsx";
import { DiscoverPage } from "./pages/Discover.jsx";
import { SettingsPage } from "./pages/Settings.jsx";
import { VideosPage } from "./pages/Videos.jsx";

export function App() {
  const { resolved } = useTheme();
  return (
    <BrowserRouter>
      <TooltipProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/discover/:id" element={<DiscoverChannelPage />} />
            <Route path="/videos" element={<VideosPage />} />
            <Route path="/channels" element={<ChannelsPage />} />
            <Route path="/channels/:slug" element={<ChannelPage />} />
            <Route path="/blogs" element={<BlogsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
        <Toaster theme={resolved} position="bottom-right" />
      </TooltipProvider>
    </BrowserRouter>
  );
}
