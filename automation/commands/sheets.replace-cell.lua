local function focusedApp(pid)
  local app = pid and hs.application.applicationForPID(pid)
  local front = hs.application.frontmostApplication()
  if not app or not front or front:pid() ~= app:pid() then return nil end
  return app
end

return {
  id = "sheets.replace-cell",
  run = function(context, done)
    if not hs.accessibilityState() then
      done("Enable Accessibility for Hammerspoon.")
      return
    end

    local app = context.pid and hs.application.applicationForPID(context.pid)
    if not app then done("The previous application is no longer available."); return end
    local clipboard = hs.pasteboard.getContents()
    if not clipboard or clipboard == "" then done("Copy the replacement text first."); return end
    local clipboardVersion = hs.pasteboard.changeCount()

    app:activate(false)
    local attempts = 20
    local function waitForFocus()
      local active = focusedApp(context.pid)
      if active then
        local window = active:focusedWindow()
        if not window or not window:title():find("Google Sheets", 1, true) then
          done("Select one cell in Google Sheets before running this command.")
          return
        end

        local windowId = window:id()
        local sequence = {
          { {}, "return" },
          { { "cmd" }, "a" },
          { { "cmd" }, "v" },
          { {}, "return" },
        }
        local position = 1
        local function sendNext()
          local currentApp = focusedApp(context.pid)
          local currentWindow = currentApp and currentApp:focusedWindow()
          if not currentWindow or currentWindow:id() ~= windowId then
            done("The Google Sheets window changed during replacement.")
            return
          end
          if hs.pasteboard.changeCount() ~= clipboardVersion then
            done("The clipboard changed during replacement. Check the selected cell.")
            return
          end
          local step = sequence[position]
          hs.eventtap.keyStroke(step[1], step[2], 0)
          position = position + 1
          if position > #sequence then done()
          else hs.timer.doAfter(context.keyDelay, sendNext) end
        end
        sendNext()
      elseif attempts > 0 then
        attempts = attempts - 1
        hs.timer.doAfter(0.05, waitForFocus)
      else
        done("Could not return to the previous application.")
      end
    end
    hs.timer.doAfter(0.12, waitForFocus)
  end,
}
