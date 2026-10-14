import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AppShell } from "./components/layout/AppShell.jsx";
import { TooltipProvider } from "./components/ui/menu.jsx";
import { ActiveChannelProvider } from "./lib/activeChannel.jsx";
import { useTheme } from "./lib/theme.jsx";
import { BlogsPage } from "./pages/Blogs.jsx";
import { ChangelogPage } from "./pages/Changelog.jsx";
import { ChannelPage } from "./pages/Channel.jsx";
import { ChannelsPage } from "./pages/Channels.jsx";
import { DashboardPage } from "./pages/Dashboard.jsx";
import { DiscoverChannelPage } from "./pages/DiscoverChannel.jsx";
import { DiscoverPage } from "./pages/Discover.jsx";
import { DocsPage } from "./pages/Docs.jsx";
import { IdeasPage } from "./pages/Ideas.jsx";
import { MyChannelNewPage } from "./pages/MyChannelNew.jsx";
import { SettingsPage } from "./pages/Settings.jsx";
import { VideosPage } from "./pages/Videos.jsx";

export function App() {
  const { resolved } = useTheme();
  return (
    <BrowserRouter>
      <TooltipProvider>
        <ActiveChannelProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/discover" element={<DiscoverPage />} />
            <Route path="/discover/:id" element={<DiscoverChannelPage />} />
            <Route path="/videos" element={<VideosPage />} />
            <Route path="/channels" element={<ChannelsPage />} />
            <Route path="/channels/:slug" element={<ChannelPage />} />
            <Route path="/blogs" element={<BlogsPage />} />
            <Route path="/ideas" element={<IdeasPage />} />
            <Route path="/my-channels/new" element={<MyChannelNewPage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/changelog" element={<ChangelogPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
        </ActiveChannelProvider>
        <Toaster theme={resolved} position="bottom-right" />
      </TooltipProvider>
    </BrowserRouter>
  );
}
