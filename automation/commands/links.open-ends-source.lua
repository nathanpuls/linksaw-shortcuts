return {
  id = "links.open-ends-source",
  run = function(_, done)
    if hs.urlevent.openURL("https://live.ends.at/source") then done()
    else done("Could not open the ends.at Source page.") end
  end,
}
