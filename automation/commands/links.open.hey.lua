return {
  id = "links.open-hey",
  run = function(_, done)
    if hs.urlevent.openURL("https://hey.com") then done()
    else done("Could not open the ends.at Source page.") end
  end,
}
